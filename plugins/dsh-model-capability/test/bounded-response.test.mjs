import test from 'node:test'
import assert from 'node:assert/strict'
import { boundedResponseText } from '../lib/bounded-response.js'

test('decoded chunked response is stopped at byte budget and reader is cancelled', async () => {
  let cancelled = false
  let produced = 0
  const stream = new ReadableStream({
    pull(c) { produced++; c.enqueue(new Uint8Array(1024)) },
    cancel() { cancelled = true },
  })
  await assert.rejects(boundedResponseText(new Response(stream), 2048), /byte limit/)
  assert.equal(cancelled, true)
  assert.ok(produced <= 5, 'must not drain an unlimited peer')
})

test('UTF-8 bytes, rather than string length, consume the budget', async () => {
  await assert.rejects(boundedResponseText(new Response('中文'), 5), /byte limit/)
  assert.equal(await boundedResponseText(new Response('中文'), 6), '中文')
})

test('declared oversize body is cancelled before reading', async () => {
  let cancelled = false
  const response = new Response(new ReadableStream({ cancel() { cancelled = true } }), { headers: { 'content-length': '10000' } })
  await assert.rejects(boundedResponseText(response, 100), /byte limit/)
  assert.equal(cancelled, true)
})

test('deadline aborts a stalled response body', async () => {
  const controller = new AbortController()
  const response = new Response(new ReadableStream({ start(c) {
    controller.signal.addEventListener('abort', () => c.error(new Error('deadline')), { once: true })
  } }))
  const result = boundedResponseText(response)
  controller.abort()
  await assert.rejects(result, /deadline/)
})
