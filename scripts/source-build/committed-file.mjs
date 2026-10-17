import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

/** Read a file through a verified commit/tree/blob chain, ignoring working files and replace refs. */
export function readCommittedFile(repo, commit, path) {
  if (!/^[a-f0-9]{40}$/.test(commit) || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('invalid committed file identity')
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
  env.GIT_NO_REPLACE_OBJECTS = '1'
  const object = (type, oid) => {
    const bytes = execFileSync('git', ['--no-replace-objects', '-C', repo, 'cat-file', type, oid], {
      env, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    })
    const actual = createHash('sha1').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex')
    if (actual !== oid) throw new Error('Git object integrity mismatch: ' + type)
    return bytes
  }
  const header = /^tree ([a-f0-9]{40})\n/.exec(object('commit', commit).toString('utf8'))
  if (!header) throw new Error('invalid committed tree')
  let oid = header[1]
  const parts = path.split('/')
  for (let i = 0; i < parts.length; i++) {
    const bytes = object('tree', oid)
    let found
    for (let offset = 0; offset < bytes.length;) {
      const nul = bytes.indexOf(0, offset)
      if (nul < 0 || nul + 21 > bytes.length) throw new Error('invalid Git tree entry')
      const entry = bytes.subarray(offset, nul).toString('utf8')
      const space = entry.indexOf(' ')
      if (space < 0) throw new Error('invalid Git tree mode')
      if (entry.slice(space + 1) === parts[i]) {
        if (found) throw new Error('duplicate Git tree entry')
        found = { mode: entry.slice(0, space), oid: bytes.subarray(nul + 1, nul + 21).toString('hex') }
      }
      offset = nul + 21
    }
    if (!found) throw new Error('committed source file missing: ' + path)
    oid = found.oid
    if (i === parts.length - 1) {
      if (!['100644', '100755'].includes(found.mode)) throw new Error('committed source file is not regular')
      return object('blob', oid)
    }
    if (found.mode !== '40000') throw new Error('committed source parent is not a tree')
  }
  throw new Error('invalid committed source path')
}
