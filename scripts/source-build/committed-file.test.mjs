import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { deflateSync } from 'node:zlib'
import { readCommittedFile } from './committed-file.mjs'

test('committed pin reads ignore mutable worktree data and verify the Git object body', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-committed-pin-'))
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid')
    mkdirSync(join(root, 'pins'))
    writeFileSync(join(root, 'pins/payload.json'), '{"trusted":true}')
    git('add', '.'); git('commit', '-qm', 'fixture')
    const commit = git('rev-parse', 'HEAD')
    writeFileSync(join(root, 'pins/payload.json'), '{"trusted":false}')
    assert.equal(readCommittedFile(root, commit, 'pins/payload.json').toString(), '{"trusted":true}')
    const oid = git('rev-parse', commit + ':pins/payload.json')
    const forged = Buffer.from('{"trusted":false}')
    const object = Buffer.concat([Buffer.from(`blob ${forged.length}\0`), forged])
    const objectPath = join(root, '.git/objects', oid.slice(0, 2), oid.slice(2))
    chmodSync(objectPath, 0o644)
    writeFileSync(objectPath, deflateSync(object))
    assert.throws(() => readCommittedFile(root, commit, 'pins/payload.json'), /integrity mismatch|hash mismatch|corrupt/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
