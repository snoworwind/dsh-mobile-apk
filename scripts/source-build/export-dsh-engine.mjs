#!/usr/bin/env node
// Package the pinned DeepSeek Harness workspace after its source build. This
// creates the cache layout consumed by build-snapshot-013.mjs, without npm
// release tarballs for first-party @deepseek-ai packages.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const repo = resolve(process.argv[2] ?? '')
const cache = resolve(process.argv[3] ?? '')
const expectedCommit = '183f08e9c6dde7e36cd2318eaee70b0da08fb35e'
const overlayPath = resolve('scripts/snapshot-config/engine-overlay.json')
if (!process.argv[2] || !process.argv[3]) {
  console.error('usage: node scripts/source-build/export-dsh-engine.mjs <dsh-source-root> <overlay-cache>')
  process.exit(2)
}

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
const commit = git('rev-parse', 'HEAD')
if (commit !== expectedCommit) throw new Error(`unexpected DeepSeek Harness commit: ${commit}`)

const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'))
const sourcePackage = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
const lockfilePath = join(repo, 'pnpm-lock.yaml')
if (!existsSync(lockfilePath)) throw new Error('pinned Harness source is missing pnpm-lock.yaml')
const wanted = new Map(Object.entries(overlay.packages).filter(([name]) => name.startsWith('@deepseek-ai/')))
wanted.set(overlay.rootPackage.name, overlay.rootPackage.version)

const manifests = new Map()
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
    const file = join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (entry.name === 'package.json') {
      let manifest
      try { manifest = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
      if (typeof manifest.name === 'string') manifests.set(manifest.name, { file, manifest })
    }
  }
}
walk(repo)

let groupManifest = null
try {
  groupManifest = JSON.parse(execFileSync('git', ['show', '7bedce822f2c6b076df167dff46eecf81bbd5de4:vendor/group/package.json'], { cwd: repo, encoding: 'utf8' }))
} catch (error) {
  throw new Error('the source checkout must include history through 7bedce822 for the pinned cordis group package', { cause: error })
}
const group = manifests.get('@deepseek-ai/cordis-plugin-group')
if (!group || groupManifest.version !== wanted.get('@deepseek-ai/cordis-plugin-group')) {
  throw new Error('could not resolve the pinned @deepseek-ai/cordis-plugin-group source manifest')
}
// The 0.1.5-rc.1 tag changed only this manifest version to 1.0.2. The APK
// overlay intentionally pins 1.0.1, whose official source commit differs only
// in that field. Verify that fact before using the old manifest for packing.
const groupDiff = git('diff', '--name-only', '7bedce822f2c6b076df167dff46eecf81bbd5de4', expectedCommit, '--', 'vendor/group')
if (groupDiff !== 'vendor/group/package.json') {
  throw new Error(`cordis-plugin-group source drifted from its 1.0.1 commit: ${groupDiff}`)
}

rmSync(cache, { recursive: true, force: true })
mkdirSync(cache, { recursive: true })
const tmp = join(cache, '.pack')
mkdirSync(tmp, { recursive: true })
const packed = []
for (const [name, version] of [...wanted].sort(([a], [b]) => a.localeCompare(b))) {
  const entry = manifests.get(name)
  if (!entry) throw new Error(`missing source package: ${name}`)
  if (name !== '@deepseek-ai/cordis-plugin-group' && entry.manifest.version !== version) {
    throw new Error(`${name} source version ${entry.manifest.version} does not match overlay pin ${version}`)
  }

  const dir = dirname(entry.file)
  const manifestPath = entry.file
  const currentManifest = readFileSync(manifestPath)
  try {
    if (name === '@deepseek-ai/cordis-plugin-group') {
      writeFileSync(manifestPath, JSON.stringify(groupManifest, null, 2) + '\n')
    }
    for (const file of readdirSync(tmp)) rmSync(join(tmp, file), { recursive: true, force: true })
    execFileSync('pnpm', ['--dir', dir, 'pack', '--pack-destination', tmp], { cwd: repo, stdio: 'inherit' })
    const candidates = readdirSync(tmp).filter((file) => file.endsWith('.tgz'))
    if (candidates.length !== 1) throw new Error(`${name}: expected one pack output, got ${candidates.length}`)
    const outName = `${name.replace('@', '').replace('/', '-')}-${version}.tgz`
    const outPath = join(cache, outName)
    renameSync(join(tmp, candidates[0]), outPath)
    const digest = createHash('sha256').update(readFileSync(outPath)).digest('hex')
    packed.push({ name, version, sourcePath: relative(repo, dir).replaceAll('\\', '/'), sha256: digest, file: outName })
    console.log(`source-pack ${name}@${version} ${digest}`)
  } finally {
    writeFileSync(manifestPath, currentManifest)
  }
}
rmSync(tmp, { recursive: true, force: true })
writeFileSync(join(cache, 'source-build-manifest.json'), JSON.stringify({
  source: 'https://github.com/deepseek-ai/deepseek-harness',
  commit,
  packageManager: sourcePackage.packageManager,
  lockfileSha256: createHash('sha256').update(readFileSync(lockfilePath)).digest('hex'),
  cordisPluginGroupSourceCommit: '7bedce822f2c6b076df167dff46eecf81bbd5de4',
  packageCount: packed.length,
  packages: packed,
}, null, 2) + '\n')
