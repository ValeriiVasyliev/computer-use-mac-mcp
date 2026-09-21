/**
 * Screenshot freshness tracking.
 *
 * The window server can return a frame that predates input we just posted,
 * which surfaces as a screenshot byte-identical to the previous one. Two
 * defences, both cheap:
 *
 *   1. Settle — wait out a short quiet period after the most recent input
 *      before capturing at all.
 *   2. Retry once — if input occurred since the previous capture and the new
 *      frame hashes identically to it, wait briefly and capture one more time.
 *
 * Exactly one retry: on a genuinely static screen the second frame will also be
 * identical, and retrying further would just burn wall-clock for nothing.
 *
 * Clock and sleep are injectable so this is testable without real delays.
 */

import { createHash } from 'crypto'

export const DEFAULT_SETTLE_MS = 120
export const DEFAULT_RETRY_MS = 180

export function hashFrame(data) {
  return createHash('sha1').update(data).digest('hex')
}

/**
 * @param {object} [opts]
 * @param {number} [opts.settleMs] quiet period required after input
 * @param {number} [opts.retryMs]  extra wait before the single retry
 * @param {() => number} [opts.now]
 * @param {(ms:number) => Promise<void>} [opts.sleep]
 */
export function createFrameTracker(opts = {}) {
  const settleMs = opts.settleMs ?? DEFAULT_SETTLE_MS
  const retryMs = opts.retryMs ?? DEFAULT_RETRY_MS
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))

  let lastInputAt = 0
  let lastHash = null
  let retries = 0
  // Counted rather than compared by timestamp: an input and a capture can land
  // in the same millisecond, which would make a time comparison miss the input.
  let inputSeq = 0
  let seqAtLastShot = 0

  return {
    /** Record that an input event was just posted. */
    markInput() {
      lastInputAt = now()
      inputSeq++
    },

    /** Number of stale-frame retries performed (diagnostics/tests). */
    get retryCount() {
      return retries
    },

    /**
     * Capture via `capture()`, settling first and retrying once on a stale frame.
     * @param {() => Promise<{base64: string}>} capture
     */
    async capture(capture) {
      const sinceInput = now() - lastInputAt
      if (sinceInput < settleMs) await sleep(settleMs - sinceInput)

      let result = await capture()
      let hash = hashFrame(result.base64)

      const inputSinceLastShot = inputSeq !== seqAtLastShot
      if (inputSinceLastShot && lastHash !== null && hash === lastHash) {
        retries++
        await sleep(retryMs)
        result = await capture()
        hash = hashFrame(result.base64)
      }

      lastHash = hash
      seqAtLastShot = inputSeq
      return result
    },
  }
}
