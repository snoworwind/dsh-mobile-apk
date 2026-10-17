import test from 'node:test'
import assert from 'node:assert/strict'
import { relative, resolve as resolvePath, sep, isAbsolute } from 'node:path'
import { HELPERS, planClientPaths } from './prepare-harness-client-paths.mjs'

test('CSS compiler identities are independent of source checkout location, physical reads remain exact', () => {
  const factory = root => new Function('REPOSITORY_ROOT', 'relative', 'resolvePath', 'sep', 'isAbsolute',
    HELPERS.replaceAll(': string', '') + ';return {canonical:dshCssCanonicalPath,physical:dshCssPhysicalPath}')(
      root, relative, resolvePath, sep, isAbsolute,
    )
  const aRoot = resolvePath('fixture-a'), bRoot = resolvePath('fixture-b')
  const a = factory(aRoot), b = factory(bRoot)
  const aFile = resolvePath(aRoot, 'packages/client/locale/src/LanguageRow.module.css')
  const bFile = resolvePath(bRoot, 'packages/client/locale/src/LanguageRow.module.css')
  assert.equal(a.canonical(aFile), b.canonical(bFile))
  assert.notEqual(aFile, bFile, 'old filename hashing differs across independent roots')
  assert.equal(a.physical(a.canonical(aFile)), aFile)
  assert.equal(b.physical(b.canonical(bFile)), bFile)
  const external = resolvePath('outside/Fixture.module.css')
  assert.equal(a.canonical(external), external, 'preserve upstream external CSS fixture behavior')
})

test('source adapter rejects absent or duplicate build anchors', () => {
  assert.throws(() => planClientPaths(''), /anchor changed/)
  assert.throws(() => planClientPaths("const CSS_VIRTUAL_PREFIX = '\\0dsh-css:'\n".repeat(2)), /anchor changed/)
})
