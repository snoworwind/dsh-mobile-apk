#!/usr/bin/env node
// Temporarily include every source-built first-party overlay package in the
// production deploy graph so pnpm deploy carries each package's dependencies.
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const [sourceArg, overlayArg, backupArg, reportArg] = process.argv.slice(2)
if (!sourceArg || !overlayArg || !backupArg || !reportArg) {
  console.error('usage: node prepare-pnpm-deploy-runtime-closure.mjs <harness-source-root> <engine-overlay.json> <backup-dir> <report.json>')
  process.exit(2)
}

const sourceRoot = resolve(sourceArg)
const packageFile = join(sourceRoot, 'package.json')
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

mkdirSync(backupDir, { recursive: true })
copyFileSync(packageFile, join(backupDir, 'package.json.original'))
copyFileSync(lockFile, join(backupDir, 'pnpm-lock.yaml.original'))
const dependencies = { ...(manifest.dependencies ?? {}) }
const devDependencies = { ...(manifest.devDependencies ?? {}) }
const optionalDependencies = { ...(manifest.optionalDependencies ?? {}) }
const peerDependencies = { ...(manifest.peerDependencies ?? {}) }
const forcedWorkspacePackages = []
for (const [name] of packages) {
  dependencies[name] = 'workspace:*'
  delete devDependencies[name]
  delete optionalDependencies[name]
  delete peerDependencies[name]
  forcedWorkspacePackages.push(name)
}
manifest.dependencies = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)))
if (Object.keys(devDependencies).length) manifest.devDependencies = devDependencies
else delete manifest.devDependencies
if (Object.keys(optionalDependencies).length) manifest.optionalDependencies = optionalDependencies
else delete manifest.optionalDependencies
if (Object.keys(peerDependencies).length) manifest.peerDependencies = peerDependencies
else delete manifest.peerDependencies

writeFileSync(packageFile, JSON.stringify(manifest, null, 2) + '\n')
writeFileSync(reportFile, JSON.stringify({
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(),
  originalPackageJsonSha256: sha256(originalPackage),
  temporaryPackageJsonSha256: sha256(readFileSync(packageFile)),
  originalLockfileSha256: sha256(originalLock),
  temporaryLockfileSha256: null,
  packageCount: forcedWorkspacePackages.length,
  productionWorkspacePackages: forcedWorkspacePackages,
  purpose: 'Temporarily add pinned first-party overlay workspace packages to the production deploy graph so pnpm deploy includes their required dependency links. Original package.json and pnpm-lock.yaml are restored after deployment.',
}, null, 2) + '\n')
console.log(`prepared temporary production dependency closure for ${forcedWorkspacePackages.length} first-party packages`)
