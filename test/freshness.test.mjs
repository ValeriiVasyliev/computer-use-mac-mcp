/**
 * Screenshot freshness tests — pure logic with an injected clock, so they run
 * instantly and post no input.
 *
 * Run: npm test
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { createFrameTracker } from '../lib/freshness.js'

/** Tracker with a virtual clock; sleeps advance time instead of waiting. */
function harness(frames) {
  let t = 1000
  const slept = []
  const tracker = createFrameTracker({
    settleMs: 120,
    retryMs: 180,
    now: () => t,
    sleep: async ms => { slept.push(ms); t += ms },
  })
  let i = 0
  const captures = []
  const capture = async () => {
    const base64 = frames[Math.min(i, frames.length - 1)]
    i++
    captures.push(base64)
    return { base64, width: 10, height: 10 }
  }
  return {
    tracker,
    capture,
    slept,
    captures,
    advance: ms => { t += ms },
    get captureCount() { return captures.length },
  }
}

test('no input yet: captures once, no retry', async () => {
  const h = harness(['frameA', 'frameA'])
  const r = await h.tracker.capture(h.capture)
  assert.equal(r.base64, 'frameA')
  assert.equal(h.captureCount, 1)
  assert.equal(h.tracker.retryCount, 0)
})

test('identical frame after input triggers exactly one retry', async () => {
  const h = harness(['same', 'same', 'same'])
  await h.tracker.capture(h.capture)      // establishes baseline
  h.tracker.markInput()
  await h.tracker.capture(h.capture)      // stale → retry
  assert.equal(h.tracker.retryCount, 1)
  assert.equal(h.captureCount, 3, 'baseline + stale + one retry')
})

test('retry happens at most once even on a fully static screen', async () => {
  const h = harness(['same', 'same', 'same', 'same', 'same'])
  await h.tracker.capture(h.capture)
  for (let n = 0; n < 3; n++) {
    h.tracker.markInput()
    await h.tracker.capture(h.capture)
  }
  // one retry per capture-after-input, never more than one each
  assert.equal(h.tracker.retryCount, 3)
  assert.equal(h.captureCount, 1 + 3 * 2)
})

test('changed frame after input does not retry', async () => {
  const h = harness(['before', 'after'])
  await h.tracker.capture(h.capture)
  h.tracker.markInput()
  const r = await h.tracker.capture(h.capture)
  assert.equal(r.base64, 'after')
  assert.equal(h.tracker.retryCount, 0)
  assert.equal(h.captureCount, 2)
})

test('identical frame WITHOUT input does not retry', async () => {
  const h = harness(['same', 'same'])
  await h.tracker.capture(h.capture)
  await h.tracker.capture(h.capture)   // no markInput in between
  assert.equal(h.tracker.retryCount, 0)
  assert.equal(h.captureCount, 2)
})

test('settles for the remaining quiet period after input', async () => {
  const h = harness(['a', 'b'])
  h.tracker.markInput()
  h.advance(30)                        // 30ms already elapsed
  await h.tracker.capture(h.capture)
  assert.deepEqual(h.slept, [90], 'waits only the remaining 90ms of the 120ms window')
})

test('does not sleep when the last input is already old', async () => {
  const h = harness(['a', 'b'])
  h.tracker.markInput()
  h.advance(500)
  await h.tracker.capture(h.capture)
  assert.deepEqual(h.slept, [], 'no settle needed')
})

test('total added delay stays bounded', async () => {
  const h = harness(['same', 'same'])
  await h.tracker.capture(h.capture)
  h.tracker.markInput()
  await h.tracker.capture(h.capture)
  const total = h.slept.reduce((a, b) => a + b, 0)
  assert.ok(total <= 120 + 180, `bounded settle+retry, got ${total}ms`)
})
