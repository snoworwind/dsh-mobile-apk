// The entry deliberately has no configurable build paths or runtime dependencies.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = name => readFileSync(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const entry = read('build-apk.yml')
const expected = `name: build-apk
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  source-build:
    uses: ./.github/workflows/build-apk-source.yml`
const check = text => assert.equal(text.split('\n').filter(line => line.trim() && !line.trimStart().startsWith('#')).join('\n').trim(), expected)
test('cloud entry calls only the same-commit source workflow unconditionally', () => check(entry))
test('negative control: additional legacy job is rejected', () => {
  assert.throws(() => check(entry + '\n  legacy:\n    runs-on: ubuntu-latest\n'), assert.AssertionError)
})
test('negative control: opt-in source path is rejected', () => {
  assert.throws(() => check(entry.replace('  source-build:', '  source-build:\n    if: ${{ inputs.source_audit }}')), assert.AssertionError)
})
test('source workflow uploads explicitly listed hidden provenance with APK', () => {
  const source = read('build-apk-source.yml')
  assert.match(source, /^  workflow_call:/m)
  const upload = source.slice(source.indexOf('      - name: Upload APK and provenance'))
  assert.match(upload, /^          include-hidden-files: true$/m)
  assert.match(upload, /^          if-no-files-found: error$/m)
  assert.match(upload, /^            \.deploy-tmp\/source-build\/project-component-provenance.json$/m)
  assert.match(upload, /^            \.deploy-tmp\/source-build\/apk-sha256.txt$/m)
  assert.doesNotMatch(upload, /^            \.deploy-tmp\/\*\*$/m)
})
