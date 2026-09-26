#!/usr/bin/env node
// Give checked-in snapshot scanners regular top-level package files while
// preserving pnpm's physical dependency directories and every reverse link.
import { readFileSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const [engineRootArg, sourceManifestArg, reportArg] = process.argv.slice(2)
if (!engineRootArg || !sourceManifestArg || !reportArg) {
  console.error('usage: node materialize-dsh-pnpm-packages.mjs <engine-root> <source-build-manifest.json> <report.json>')
  process.exit(2)
}

const engineRoot = realpathSync(resolve(engineRootArg))
const sourceManifest = JSON.parse(readFileSync(resolve(sourceManifestArg), 'utf8'))
const reportPath = resolve(reportArg)
const within = (root, candidate) => {
  const rel = relative(root, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}
const entries = sourceManifest.packages.filter((item) => item.name.startsWith('@deepseek-ai/') && item.name !== '@deepseek-ai/dsh')
if (entries.length < 266) throw new Error(`expected at least 266 pinned first-party workspace packages, found ${entries.length}`)

const materialized = []
for (const item of entries) {
  const target = join(engineRoot, 'node_modules', ...item.name.split('/'))
  if (!existsSync(join(target, 'package.json'))) throw new Error(`missing deployed source package ${item.name}@${item.version}`)
  const before = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))
  if (before.name !== item.name || before.version !== item.version) {
    throw new Error(`${item.name} deploy identity mismatch: ${before.name}@${before.version}, expected ${item.version}`)
  }

  const targetStat = lstatSync(target)
  if (!targetStat.isSymbolicLink()) {
    if (!targetStat.isDirectory()) throw new Error(`${item.name} top-level target is not a directory`)
    materialized.push({ name: item.name, version: item.version, alreadyMaterialized: true })
    continue
  }

  const physicalTarget = realpathSync(target)
  if (!within(engineRoot, physicalTarget) || physicalTarget === target) {
    throw new Error(`${item.name} pnpm target escapes the engine tree or is self-referential`)
  }
  const linkBackup = join(dirname(target), `.${basename(target)}.source-link-backup-${process.pid}`)
  if (existsSync(linkBackup)) throw new Error(`materialization backup already exists: ${linkBackup}`)
  const physicalNodeModules = join(physicalTarget, 'node_modules')
  const hasNodeModules = existsSync(physicalNodeModules)

  renameSync(target, linkBackup)
  mkdirSync(target)
  if (hasNodeModules) {
    symlinkSync(relative(target, physicalNodeModules), join(target, 'node_modules'), 'dir')
  }

  const movedEntries = []
  for (const child of readdirSync(physicalTarget, { withFileTypes: true })) {
    if (child.name === 'node_modules') continue
    const source = join(physicalTarget, child.name)
    const destination = join(target, child.name)
    renameSync(source, destination)
    symlinkSync(relative(dirname(source), destination), source, child.isDirectory() ? 'dir' : 'file')
    movedEntries.push(child.name)
  }
  rmSync(linkBackup, { force: true })

  const after = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))
  if (after.name !== item.name || after.version !== item.version) {
    throw new Error(`${item.name} materialized identity changed: ${after.name}@${after.version}`)
  }
  materialized.push({
    name: item.name,
    version: item.version,
    materializedRegularFiles: true,
    preservedPnpmDependencyDirectory: hasNodeModules,
    movedTopLevelEntries: movedEntries,
    physicalStorePath: relative(engineRoot, physicalTarget).replaceAll(sep, '/'),
  })
}

const report = {
  sourceCommit: sourceManifest.commit,
  packageCount: materialized.length,
  convertedSymlinkCount: materialized.filter((item) => item.materializedRegularFiles).length,
  preservedPnpmNodeModulesLinkCount: materialized.filter((item) => item.preservedPnpmDependencyDirectory).length,
  packages: materialized,
  purpose: 'Expose source-built package payload files at their normal node_modules paths for snapshot scanners. The original .pnpm package payloads are replaced by relative links to the top-level files, while each package keeps its original physical node_modules dependency directory so Node resolves the same locked closure.',
}
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
console.log(`materialized ${report.convertedSymlinkCount} first-party package links; preserved ${report.preservedPnpmNodeModulesLinkCount} pnpm dependency directories`)
