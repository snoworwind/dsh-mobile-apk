import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { canonicalPackageJson } from './normalize-snapshot.mjs'

/** Dependency directories have a separate provenance check; package-owned payload is exact. */
export function packagePayload(root, allowedRoot = root) {
  const physical = realpathSync(allowedRoot)
  const files = new Map()
  const active = new Set()
  function walk(dir, prefix = '') {
    const directory = realpathSync(dir)
    if (active.has(directory)) throw new Error('Cyclic package payload link')
    active.add(directory)
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const path = join(dir, entry.name)
      const name = prefix + entry.name
      const info = lstatSync(path)
      const target = realpathSync(path)
      const rel = relative(physical, target)
      if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error(`Payload link escapes package: ${name}`)
      const resolved = info.isSymbolicLink() ? lstatSync(target) : info
      if (resolved.isDirectory()) walk(path, name + '/')
      else if (resolved.isFile()) {
        // Audit runtime code/data and dispatch metadata. Source maps and declarations
        // are deliberately stripped by slim.json; pnpm also adds workspace YAML.
        if (!/\.(?:js|cjs|mjs|json|wasm|node)$/.test(name)) continue
        let bytes = readFileSync(path)
        if (name === 'package.json') {
          // Preserve all runtime/plugin metadata, including conditional export order.
          bytes = Buffer.from(canonicalPackageJson(bytes.toString('utf8')))
        }
        files.set(name, createHash('sha256').update(bytes).digest('hex'))
      } else throw new Error(`Unexpected special payload file: ${name}`)
    }
    active.delete(directory)
  }
  walk(root)
  return files
}

export function verifyPackagePayload(expected, actual, label, allowedRoot = actual) {
  const a = packagePayload(expected)
  const b = packagePayload(actual, allowedRoot)
  if (a.size !== b.size) throw new Error(`${label}: payload file set mismatch`)
  for (const [file, digest] of a) {
    if (b.get(file) !== digest) throw new Error(`${label}: payload bytes differ: ${file}`)
  }
  return a.size
}

/** Stable across tar ownership/timestamps and non-runtime pnpm metadata. */
export function packagePayloadDigest(root) {
  const entries = [...packagePayload(root)].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex')
}

export function verifyPinnedPackagePayload(root, pin, name, version) {
  if (!pin || pin.version !== version || !/^[a-f0-9]{64}$/.test(pin.payloadSha256 ?? '')) {
    throw new Error(`${name}: missing immutable source payload pin`)
  }
  const digest = packagePayloadDigest(root)
  if (digest !== pin.payloadSha256) throw new Error(`${name}: immutable source payload pin mismatch`)
  return digest
}
