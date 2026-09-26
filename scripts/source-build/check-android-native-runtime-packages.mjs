#!/usr/bin/env node
// Check and hash the trusted publisher packages required by the Android runtime.
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const [engineArg, reportArg] = process.argv.slice(2)
if (!engineArg || !reportArg) {
  console.error('usage: node check-android-native-runtime-packages.mjs <deployed-engine-root> <report.json>')
  process.exit(2)
}

const engineRoot = realpathSync(resolve(engineArg))
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const within = (root, path) => {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

function packageAt(engineRootPath, fromDir, name) {
  const parts = name.startsWith('@') ? name.split('/').slice(0, 2) : [name.split('/')[0]]
  let current = fromDir
  while (within(engineRootPath, current)) {
    const candidate = join(current, 'node_modules', ...parts)
    if (existsSync(join(candidate, 'package.json'))) {
      const physical = realpathSync(candidate)
      if (!within(engineRootPath, physical)) throw new Error(`${name} escapes the deployed engine tree`)
      return physical
    }
    const parent = dirname(current)
    if (parent === current || !within(engineRootPath, parent)) break
    current = parent
  }
  throw new Error(`${name} is not reachable from ${relative(engineRootPath, fromDir)}`)
}

function readPackage(dir, expectedName, expectedVersion) {
  const manifestPath = join(dir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.name !== expectedName || manifest.version !== expectedVersion) {
    throw new Error(`${expectedName} package identity mismatch: ${manifest.name}@${manifest.version}`)
  }
  return { manifest, manifestSha256: sha256(readFileSync(manifestPath)) }
}

function filesUnder(dir) {
  const files = []
  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) {
        files.push({
          path: relative(dir, path).replaceAll(sep, '/'),
          size: lstatSync(path).size,
          sha256: sha256(readFileSync(path)),
        })
      }
    }
  }
  walk(dir)
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

const scopeRoot = join(engineRoot, 'node_modules', '@deepseek-ai')
const subprocessRoot = realpathSync(join(scopeRoot, 'dsh-subprocess-local'))
const win32ProcessRoot = realpathSync(join(scopeRoot, 'dsh-win32-process'))
const attachmentRoot = realpathSync(join(scopeRoot, 'dsh-attachment-local'))

const koffiConsumers = [
  ['@deepseek-ai/dsh-subprocess-local', subprocessRoot],
  ['@deepseek-ai/dsh-win32-process', win32ProcessRoot],
]
const koffiCopies = new Map()
for (const [consumer, consumerRoot] of koffiConsumers) {
  const koffiRoot = packageAt(engineRoot, consumerRoot, 'koffi')
  const { manifest } = readPackage(koffiRoot, 'koffi', '3.2.1')
  if (manifest.optionalDependencies?.['@koromix/koffi-android-arm64'] !== '3.2.1') {
    throw new Error('Koffi 3.2.1 does not declare its matching Android ARM64 package')
  }
  const platformRoot = resolve(koffiRoot, '..', '@koromix', 'koffi-android-arm64')
  const platformPackage = readPackage(platformRoot, '@koromix/koffi-android-arm64', '3.2.1')
  if (!koffiCopies.has(koffiRoot)) {
    const nativeFiles = filesUnder(platformRoot).filter((file) => file.path.endsWith('.node'))
    if (nativeFiles.length !== 1) throw new Error(`expected one Koffi Android native module, found ${nativeFiles.length}`)
    const nativePath = join(platformRoot, nativeFiles[0].path)
    const header = readFileSync(nativePath).subarray(0, 20)
    if (header.length < 20 || header[0] !== 0x7f || header[1] !== 0x45 || header[2] !== 0x4c || header[3] !== 0x46
      || header[4] !== 2 || header[5] !== 1 || header.readUInt16LE(18) !== 183) {
      throw new Error('Koffi Android native module is not a little-endian AArch64 ELF file')
    }
    koffiCopies.set(koffiRoot, {
      package: { name: 'koffi', version: '3.2.1', manifestSha256: sha256(readFileSync(join(koffiRoot, 'package.json'))) },
      androidBinding: {
        name: '@koromix/koffi-android-arm64',
        version: platformPackage.manifest.version,
        manifestSha256: platformPackage.manifestSha256,
        files: filesUnder(platformRoot),
        nativeModule: nativeFiles[0],
        elfMachine: 'AArch64',
      },
    })
  }
  koffiCopies.get(koffiRoot).consumers ??= []
  koffiCopies.get(koffiRoot).consumers.push(consumer)
}

const sharpRoot = packageAt(engineRoot, attachmentRoot, 'sharp')
const sharpPackage = readPackage(sharpRoot, 'sharp', '0.35.3')
const sharpRequire = createRequire(join(sharpRoot, 'dist', 'sharp.mjs'))
const sharpWasmEntry = sharpRequire.resolve('@img/sharp-wasm32/sharp.node')
const sharpWasmRoot = realpathSync(dirname(sharpWasmEntry))
const sharpWasm = readPackage(sharpWasmRoot, '@img/sharp-wasm32', '0.35.3')
const emnapiRoot = packageAt(engineRoot, sharpWasmRoot, '@emnapi/runtime')
const emnapiPackage = JSON.parse(readFileSync(join(emnapiRoot, 'package.json'), 'utf8'))
const sharpLoader = readFileSync(join(sharpRoot, 'dist', 'sharp.mjs'), 'utf8')
if (!sharpLoader.includes('require("@img/sharp-wasm32/sharp.node")')) {
  throw new Error('Sharp loader no longer exposes the expected WASM fallback')
}

const report = {
  target: 'android-arm64',
  koffi: [...koffiCopies.values()],
  sharp: {
    package: { name: 'sharp', version: sharpPackage.manifest.version, manifestSha256: sharpPackage.manifestSha256 },
    wasmFallback: {
      name: sharpWasm.manifest.name,
      version: sharpWasm.manifest.version,
      manifestSha256: sharpWasm.manifestSha256,
      resolvedEntry: relative(engineRoot, sharpWasmEntry).replaceAll(sep, '/'),
      files: filesUnder(sharpWasmRoot),
    },
    emnapiRuntime: { name: emnapiPackage.name, version: emnapiPackage.version },
  },
}
writeFileSync(resolve(reportArg), JSON.stringify(report, null, 2) + '\n')
console.log(`Android runtime native package audit passed: Koffi ${report.koffi.map((item) => item.androidBinding.version).join(', ')} and Sharp WASM ${report.sharp.wasmFallback.version}`)
