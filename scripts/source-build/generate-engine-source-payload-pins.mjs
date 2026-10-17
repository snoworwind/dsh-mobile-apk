#!/usr/bin/env node
// Regenerate scripts/snapshot-config/engine-source-payload-pins.json from two
// independent local source-chain build trees. The two trees must have been built
// from the same Harness commit and lockfile; every package payload must match
// byte-for-byte after the reviewed client CSS path transform. Anything else is
// refused instead of being written as a "pin".
//
// Why two trees: a single tree proves nothing about determinism. The pin gate in
// check-dsh-source-snapshot.mjs only becomes meaningful when the pinned digest is
// reproducible from independent builds of the same inputs.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { packagePayload, packagePayloadDigest } from './verify-package-payload.mjs'
import { readCommittedFile } from './committed-file.mjs'
import { POLICY } from './prepare-harness-client-paths.mjs'

const [first, second, output] = process.argv.slice(2)
if (!first || !second || !output) {
  throw new Error('usage: generate-engine-source-payload-pins.mjs <build-root-a> <build-root-b> <out.json>')
}
const roots = [resolve(first), resolve(second)]
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

function workspaceCommit(root) {
  const marker = join(root, '.dsh-local-source-workspace.json')
  if (!existsSync(marker)) return null
  const parsed = JSON.parse(readFileSync(marker, 'utf8'))
  return parsed.commit ?? parsed.sourceCommit ?? null
}

function manifestOf(root) {
  const path = join(root, '.deploy-tmp/engine-overlay/source-build-manifest.json')
  if (!existsSync(path)) throw new Error('missing source-build manifest: ' + path)
  return JSON.parse(readFileSync(path, 'utf8'))
}

const manifests = roots.map(manifestOf)
if (manifests.some((m) => m.commit !== manifests[0].commit)) throw new Error('build roots use different Harness commits')
if (manifests.some((m) => m.lockfileSha256 !== manifests[0].lockfileSha256)) throw new Error('build roots use different lockfiles')

// The adapter bytes are part of the trust input, so read them from Git instead of
// the working tree (autocrlf or a dirty edit must not silently change the pin).
const repo = fileURLToPath(new URL('../../', import.meta.url))
const head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const adapterPath = 'scripts/source-build/prepare-harness-client-paths.mjs'
const adapterSha256 = sha256(readCommittedFile(repo, head, adapterPath))

const result = {
  schema: 1,
  harnessCommit: manifests[0].commit,
  lockfileSha256: manifests[0].lockfileSha256,
  clientBuildPathPolicy: POLICY,
  clientBuildAdapterSha256: adapterSha256,
  referenceProjectCommits: roots.map(workspaceCommit).filter((commit) => commit !== null),
  packages: {},
}

const scratch = mkdtempSync(join(tmpdir(), 'dsh-payload-pin-'))
try {
  for (const item of manifests[0].packages) {
    const digests = []
    const payloads = []
    for (let index = 0; index < roots.length; index++) {
      const other = manifests[index].packages.find((p) => p.name === item.name)
      if (!other || other.version !== item.version || other.sourcePath !== item.sourcePath) {
        throw new Error('package identity differs between build roots: ' + item.name)
      }
      const archive = join(roots[index], '.deploy-tmp/engine-overlay', other.file)
      if (!existsSync(archive) || sha256(readFileSync(archive)) !== other.sha256) {
        throw new Error('source tarball checksum differs: ' + item.name)
      }
      const target = join(scratch, `${index}-${item.name.replace(/[^A-Za-z0-9._-]/g, '_')}`)
      mkdirSync(target)
      try {
        execFileSync('tar', ['-xzf', archive, '-C', target, '--strip-components=1'])
        // A CSS-only rebuild can leave a checkout whose runtime bytes are newer than
        // its packed tarball. Refresh runtime bytes from that checkout (the tarball's
        // file inventory and package.json stay authoritative) so the pin describes the
        // bytes a fresh chain would pack from the same source tree.
        const sourceRoot = join(roots[index], '.deploy-tmp/deepseek-harness')
        const original = readCommittedFile(sourceRoot, manifests[index].commit, other.sourcePath + '/package.json')
        const sourceManifest = JSON.parse(original)
        if (sourceManifest.name !== item.name || sourceManifest.version !== item.version) {
          throw new Error('source package identity differs from the committed manifest: ' + item.name)
        }
        for (const file of packagePayload(target).keys()) {
          if (file === 'package.json') continue
          const source = join(sourceRoot, other.sourcePath, file)
          if (!existsSync(source)) throw new Error('source payload file missing: ' + item.name + '/' + file)
          copyFileSync(source, join(target, file))
        }
        const payload = packagePayload(target)
        // The manifest dispatch fields must still be present in the extracted package.
        const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))
        if (manifest.name !== item.name || manifest.version !== item.version) {
          throw new Error('packed manifest identity differs: ' + item.name)
        }
        digests.push(packagePayloadDigest(target))
        payloads.push(payload)
      } finally {
        rmSync(target, { recursive: true, force: true })
      }
    }
    if (digests[0] !== digests[1]) {
      const files = [...new Set([...payloads[0].keys(), ...payloads[1].keys()])]
        .filter((file) => payloads[0].get(file) !== payloads[1].get(file))
      throw new Error('independent source builds differ: ' + item.name + ' files=' + JSON.stringify(files))
    }
    result.packages[item.name] = {
      version: item.version,
      sourcePath: item.sourcePath,
      payloadSha256: digests[0],
    }
  }
  writeFileSync(resolve(output), JSON.stringify(result, null, 2) + '\n')
  console.log('pinned ' + Object.keys(result.packages).length + ' source package payloads from two independent builds')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
