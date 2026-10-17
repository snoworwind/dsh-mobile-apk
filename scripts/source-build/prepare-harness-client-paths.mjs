import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readCommittedFile } from './committed-file.mjs'

export const POLICY = 'canonical-client-css-path-v1'
export const HELPERS = `
// dsh-mobile reproducible CSS paths (R2)
const DSH_CSS_SOURCE_PREFIX = '/__dsh_harness_source__/'
function dshCssCanonicalPath(fileId: string): string {
  const rel = relative(REPOSITORY_ROOT, fileId).split(sep).join('/')
  if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) return fileId
  return DSH_CSS_SOURCE_PREFIX + rel
}
function dshCssPhysicalPath(fileId: string): string {
  return fileId.startsWith(DSH_CSS_SOURCE_PREFIX)
    ? resolvePath(REPOSITORY_ROOT, fileId.slice(DSH_CSS_SOURCE_PREFIX.length)) : fileId
}
`

function once(source, before, after, count = 1) {
  if (source.split(before).length - 1 !== count) throw new Error('client CSS build anchor changed: ' + before)
  return source.split(before).join(after)
}

export function planClientPaths(source) {
  let next = once(source, "const CSS_VIRTUAL_PREFIX = '\\0dsh-css:'", HELPERS + "\nconst CSS_VIRTUAL_PREFIX = '\\0dsh-css:'")
  for (const prefix of ['CSS_VIRTUAL_PREFIX', 'INLINE_CSS_VIRTUAL_PREFIX', 'GLOBAL_CSS_VIRTUAL_PREFIX']) {
    next = once(next, `return ${prefix} + abs + CSS_VIRTUAL_SUFFIX`, `return ${prefix} + dshCssCanonicalPath(abs) + CSS_VIRTUAL_SUFFIX`)
    next = once(next, `const fileId = virtualId.slice(${prefix}.length, -CSS_VIRTUAL_SUFFIX.length)`,
      `const fileId = dshCssPhysicalPath(virtualId.slice(${prefix}.length, -CSS_VIRTUAL_SUFFIX.length))`)
  }
  next = once(next, 'filename: fileId,', 'filename: dshCssCanonicalPath(fileId),', 3)
  next = once(next, 'return prefix === undefined ? id : id.slice(prefix.length, -CSS_VIRTUAL_SUFFIX.length)',
    'return prefix === undefined ? id : dshCssPhysicalPath(id.slice(prefix.length, -CSS_VIRTUAL_SUFFIX.length))')
  return next
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [repoArg, reportArg] = process.argv.slice(2)
  if (!repoArg || !reportArg) throw new Error('usage: prepare-harness-client-paths.mjs <pinned-source-root> <report>')
  const repo = resolve(repoArg)
  const commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (commit !== '639ed015397290b3745d163aafe02ffee4aa3f84') throw new Error('unexpected Harness source commit')
  const path = 'packages/client/tsdown.client.ts'
  const original = readCommittedFile(repo, commit, path).toString('utf8')
  const patched = planClientPaths(original)
  const actual = readFileSync(resolve(repo, path), 'utf8').replaceAll('\r\n', '\n')
  if (actual !== original && actual !== patched) throw new Error('client compiler configuration changed outside the reviewed transform')
  writeFileSync(resolve(repo, path), patched)
  const sha = bytes => createHash('sha256').update(bytes).digest('hex')
  mkdirSync(dirname(resolve(reportArg)), { recursive: true })
  writeFileSync(resolve(reportArg), JSON.stringify({ policy: POLICY, sourceCommit: commit, path,
    originalSha256: sha(original), transformedSha256: sha(patched), adapterSha256: sha(readFileSync(fileURLToPath(import.meta.url))) }, null, 2) + '\n')
  console.log('canonical client CSS source paths prepared')
}
