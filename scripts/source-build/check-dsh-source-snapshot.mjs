#!/usr/bin/env node
// Source-build replacement for check-engine-overlay.mjs: inspect the final
// snapshot's pnpm links and source package versions instead of legacy npm paths.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { checkDshRuntimeDependencies } from './check-dsh-runtime-dependencies.mjs'

const snapshotArg = process.argv[2]
if (!snapshotArg) {
  console.error('usage: node check-dsh-source-snapshot.mjs <snapshot.tar.xz>')
  process.exit(2)
}

const snapshot = resolve(snapshotArg)
const sourceBuildRoot = resolve('.deploy-tmp/source-build')
const sourceManifestPath = resolve('.deploy-tmp/engine-overlay/source-build-manifest.json')
const reportPath = join(sourceBuildRoot, 'source-engine-snapshot-check.json')
const packageCache = resolve('.deploy-tmp/engine-overlay')
const expectedCommit = '183f08e9c6dde7e36cd2318eaee70b0da08fb35e'
const packagePrefix = 'usr/lib/node_modules/@deepseek-ai/dsh'
const sha256 = (data) => createHash('sha256').update(data).digest('hex')
async function sha256File(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
const within = (root, candidate) => {
  const rel = relative(root, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}
const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8'))
if (sourceManifest.commit !== expectedCommit) throw new Error(`unexpected Harness source commit: ${sourceManifest.commit}`)
if (sourceManifest.packageCount !== sourceManifest.packages?.length || sourceManifest.packageCount < 267) {
  throw new Error(`source package manifest is incomplete: ${sourceManifest.packageCount}`)
}

const tempRoot = mkdtempSync(join(tmpdir(), 'dsh-source-snapshot-'))
try {
  execFileSync('tar', [
    '-xJf', snapshot,
    '-C', tempRoot,
    '--no-same-owner',
    '--no-same-permissions',
    packagePrefix,
  ], { stdio: 'inherit' })
  const engineRoot = join(tempRoot, packagePrefix)
  const physicalEngineRoot = realpathSync(engineRoot)
  const packageChecks = []
  for (const item of sourceManifest.packages) {
    const packageDir = item.name === '@deepseek-ai/dsh'
      ? engineRoot
      : join(engineRoot, 'node_modules', ...item.name.split('/'))
    const packageJson = join(packageDir, 'package.json')
    if (!existsSync(packageJson)) throw new Error(`snapshot is missing source package ${item.name}@${item.version}`)
    const physicalPackageDir = realpathSync(packageDir)
    if (!within(physicalEngineRoot, physicalPackageDir)) throw new Error(`${item.name} link escapes the source engine tree`)
    const manifest = JSON.parse(readFileSync(packageJson, 'utf8'))
    if (manifest.name !== item.name || manifest.version !== item.version) {
      throw new Error(`${item.name} snapshot identity mismatch: ${manifest.name}@${manifest.version}, expected ${item.version}`)
    }
    const archive = join(packageCache, item.file)
    if (!existsSync(archive) || sha256(readFileSync(archive)) !== item.sha256) {
      throw new Error(`${item.name}@${item.version} source tarball hash mismatch`)
    }
    packageChecks.push({ name: item.name, version: item.version, sourceTarballSha256: item.sha256 })
  }

  const dependencyCheck = checkDshRuntimeDependencies(engineRoot)
  const patchRegistry = JSON.parse(readFileSync('scripts/patches/registry.json', 'utf8'))
  const patchChecks = []
  const runtimePrefix = `${packagePrefix}/`
  for (const patch of patchRegistry.patches.filter((item) => item.scope === 'engine' && item.overlayCheck !== false)) {
    const marker = String(patch.marker ?? '').replace(/（.*$/, '').trim()
    if (!marker) continue
    if (!patch.target.startsWith(runtimePrefix)) throw new Error(`engine patch target escaped the source runtime: ${patch.target}`)
    const target = resolve(engineRoot, patch.target.slice(runtimePrefix.length))
    if (!within(engineRoot, target) || !existsSync(target)) throw new Error(`source snapshot patch target missing: ${patch.id}`)
    const physicalTarget = realpathSync(target)
    if (!within(physicalEngineRoot, physicalTarget)) throw new Error(`source snapshot patch target link escaped: ${patch.id}`)
    const content = readFileSync(target, 'utf8')
    if (!content.includes(marker)) throw new Error(`source snapshot patch marker missing: ${patch.id} (${marker})`)
    patchChecks.push({ id: patch.id, target: patch.target, marker })
  }

  const presetsRoot = join(engineRoot, 'node_modules/@deepseek-ai/dsh-agent-presets/presets')
  const presetCount = existsSync(presetsRoot) ? readdirSync(presetsRoot).length : 0
  if (presetCount < 1) throw new Error('source snapshot has no built-in dsh-agent-presets entries')

  const report = {
    source: sourceManifest.source,
    sourceCommit: sourceManifest.commit,
    sourceLockfileSha256: sourceManifest.lockfileSha256,
    snapshotSha256: await sha256File(snapshot),
    packageCount: packageChecks.length,
    packages: packageChecks,
    dependencyCheck,
    patchChecks,
    builtInPresetCount: presetCount,
  }
  mkdirSync(sourceBuildRoot, { recursive: true })
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log(`source snapshot check passed: ${packageChecks.length} pinned packages, ${dependencyCheck.dependencyCount} dependency links, ${patchChecks.length} engine patch markers, ${presetCount} presets`)
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
