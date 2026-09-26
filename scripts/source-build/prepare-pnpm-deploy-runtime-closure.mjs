#!/usr/bin/env node
// Temporarily add every source-built first-party overlay package to the actual
// pnpm deploy target's production graph, updating its frozen importer directly.
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'

const [sourceArg, overlayArg, backupArg, reportArg] = process.argv.slice(2)
if (!sourceArg || !overlayArg || !backupArg || !reportArg) {
  console.error('usage: node prepare-pnpm-deploy-runtime-closure.mjs <harness-source-root> <engine-overlay.json> <backup-dir> <report.json>')
  process.exit(2)
}

const sourceRoot = resolve(sourceArg)
const cliDir = join(sourceRoot, 'apps', 'cli')
const packageFile = join(cliDir, 'package.json')
const lockFile = join(sourceRoot, 'pnpm-lock.yaml')
const backupDir = resolve(backupArg)
const reportFile = resolve(reportArg)
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const originalPackage = readFileSync(packageFile)
const originalLock = readFileSync(lockFile)
const manifest = JSON.parse(originalPackage.toString('utf8'))
const overlay = JSON.parse(readFileSync(resolve(overlayArg), 'utf8'))
const packages = Object.entries(overlay.packages ?? {})
  .filter(([name]) => name.startsWith('@deepseek-ai/'))
  .sort(([a], [b]) => a.localeCompare(b))
if (packages.length < 200) throw new Error(`expected the pinned first-party package set, found ${packages.length}`)

const requireFromCli = createRequire(packageFile)
const yaml = requireFromCli('js-yaml')
const lock = yaml.load(originalLock.toString('utf8'))
const importer = lock.importers?.['apps/cli']
if (!importer) throw new Error('pnpm-lock.yaml is missing the apps/cli importer')

const packageDirs = new Map()
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
    const file = join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (entry.name === 'package.json') {
      let candidate
      try { candidate = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
      if (typeof candidate.name === 'string') packageDirs.set(candidate.name, dirname(file))
    }
  }
}
walk(sourceRoot)

mkdirSync(backupDir, { recursive: true })
copyFileSync(packageFile, join(backupDir, 'apps-cli-package.json.original'))
copyFileSync(lockFile, join(backupDir, 'pnpm-lock.yaml.original'))

const dependencies = { ...(manifest.dependencies ?? {}) }
const sections = ['devDependencies', 'optionalDependencies', 'peerDependencies']
const removedFrom = Object.fromEntries(sections.map((section) => [section, []]))
const importerDependencies = { ...(importer.dependencies ?? {}) }
const removedFromImporter = Object.fromEntries(['devDependencies', 'optionalDependencies', 'peerDependencies'].map((section) => [section, []]))
const forcedWorkspacePackages = []
for (const [name] of packages) {
  const packageDir = packageDirs.get(name)
  if (!packageDir) throw new Error(`no pinned workspace source package found for ${name}`)
  const linkPath = relative(cliDir, packageDir).replaceAll('\\', '/')
  if (!linkPath.startsWith('../')) throw new Error(`${name} resolves inside apps/cli instead of a sibling workspace package: ${linkPath}`)
  dependencies[name] = 'workspace:*'
  importerDependencies[name] = { specifier: 'workspace:*', version: `link:${linkPath}` }
  for (const section of sections) {
    if (manifest[section] && Object.hasOwn(manifest[section], name)) {
      delete manifest[section][name]
      removedFrom[section].push(name)
    }
  }
  for (const section of Object.keys(removedFromImporter)) {
    if (importer[section] && Object.hasOwn(importer[section], name)) {
      delete importer[section][name]
      removedFromImporter[section].push(name)
    }
  }
  forcedWorkspacePackages.push({ name, path: linkPath })
}

manifest.dependencies = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)))
for (const section of sections) {
  if (manifest[section] && !Object.keys(manifest[section]).length) delete manifest[section]
}
importer.dependencies = Object.fromEntries(Object.entries(importerDependencies).sort(([a], [b]) => a.localeCompare(b)))
for (const section of Object.keys(removedFromImporter)) {
  if (importer[section] && !Object.keys(importer[section]).length) delete importer[section]
}

const temporaryPackage = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
const temporaryLock = Buffer.from(yaml.dump(lock, { lineWidth: -1, noRefs: true, quotingType: "'" }))
writeFileSync(packageFile, temporaryPackage)
writeFileSync(lockFile, temporaryLock)
writeFileSync(reportFile, JSON.stringify({
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(),
  deployTarget: 'apps/cli (@deepseek-ai/dsh)',
  originalPackageJsonSha256: sha256(originalPackage),
  temporaryPackageJsonSha256: sha256(temporaryPackage),
  originalLockfileSha256: sha256(originalLock),
  temporaryLockfileSha256: sha256(temporaryLock),
  packageCount: forcedWorkspacePackages.length,
  productionWorkspacePackages: forcedWorkspacePackages,
  removedFromManifestSections: removedFrom,
  removedFromImporterSections: removedFromImporter,
  purpose: 'Temporarily add pinned first-party overlay workspace packages to the apps/cli production deploy graph and its lockfile importer so pnpm deploy includes their runtime dependency links. Original apps/cli/package.json and pnpm-lock.yaml are restored after deployment.',
}, null, 2) + '\n')
console.log(`prepared apps/cli production dependency closure for ${forcedWorkspacePackages.length} first-party packages`)
