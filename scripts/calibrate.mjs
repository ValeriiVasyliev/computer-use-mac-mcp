#!/usr/bin/env node
/**
 * Live coordinate calibration: screenshot centre → actual cursor centre.
 *
 * Verifies on the real display that a coordinate in screenshot space lands
 * where it should, by moving the cursor there and reading the hardware position
 * back through the inverse conversion.
 *
 * This only MOVES the cursor — it never clicks, types, or touches any window,
 * so it is safe to run over a live desktop with apps open.
 *
 * Run: npm run calibrate
 */

import * as geometry from '../packages/computer-use-geometry/index.js'
import * as cuInput from '../packages/computer-use-input/index.js'
import * as cuSwift from '../packages/computer-use-swift/index.js'

const TOLERANCE_SHOT_PX = 1.0
const sleep = ms => new Promise(r => setTimeout(r, ms))

function fmt(n) { return Number(n).toFixed(1).padStart(7) }

async function calibrateDisplay(display) {
  const shot = geometry.screenshotSize(display)
  const { w, h } = display.points

  console.log(`\nDisplay #${display.index}  cgID=${display.cgDisplayId}`)
  console.log(`  points      : ${w} x ${h} @ (${display.points.x}, ${display.points.y})`)
  console.log(`  scaleFactor : ${display.scaleFactor}`)
  console.log(`  pixels      : ${display.pixels.w} x ${display.pixels.h}`)
  console.log(`  screenshot  : ${shot.width} x ${shot.height}`)

  // Confirm a real capture matches the geometry we map coordinates against.
  const cap = await cuSwift.screenshot.captureExcluding([], 0.75, shot.width, shot.height, display.index)
  const capOk = cap.width === shot.width && cap.height === shot.height
  console.log(`  capture     : ${cap.width} x ${cap.height} ${capOk ? '✓ matches' : '✗ MISMATCH'}`)

  const targets = [
    ['centre',       shot.width / 2,     shot.height / 2],
    ['top-left',     1,                  1],
    ['top-right',    shot.width - 1,     1],
    ['bottom-left',  1,                  shot.height - 1],
    ['bottom-right', shot.width - 1,     shot.height - 1],
    ['1/4',          shot.width * 0.25,  shot.height * 0.25],
    ['3/4',          shot.width * 0.75,  shot.height * 0.75],
  ]

  console.log(`\n  ${'target'.padEnd(13)} ${'asked(shot)'.padEnd(17)} ${'points'.padEnd(17)} ${'readback(shot)'.padEnd(17)} err`)
  let worst = 0
  let failures = 0

  for (const [label, sx, sy] of targets) {
    const pt = geometry.screenshotToPoints(sx, sy, shot, display)
    await cuInput.moveMouse(pt.x, pt.y, false)
    await sleep(90)

    const actual = await cuInput.mouseLocation()
    const back = geometry.pointsToScreenshot(actual.x, actual.y, shot, display)
    const err = Math.hypot(back.x - sx, back.y - sy)
    worst = Math.max(worst, err)
    const bad = err > TOLERANCE_SHOT_PX
    if (bad) failures++

    console.log(
      `  ${label.padEnd(13)} (${fmt(sx)},${fmt(sy)}) (${fmt(pt.x)},${fmt(pt.y)}) ` +
      `(${fmt(back.x)},${fmt(back.y)}) ${err.toFixed(2)}${bad ? '  ✗' : ''}`,
    )
  }

  console.log(`\n  worst error: ${worst.toFixed(2)} screenshot px (tolerance ${TOLERANCE_SHOT_PX})`)
  return { ok: failures === 0 && capOk, worst }
}

async function main() {
  const displays = geometry.getDisplays()
  console.log(`Found ${displays.length} display(s).`)
  console.log('Moving the cursor only — no clicks, no keystrokes, no window interaction.')

  const startPos = await cuInput.mouseLocation()
  let allOk = true
  try {
    for (const d of displays) {
      const { ok } = await calibrateDisplay(d)
      allOk = allOk && ok
    }
  } finally {
    // Put the cursor back where we found it.
    await cuInput.moveMouse(startPos.x, startPos.y, false)
  }

  console.log(allOk ? '\nPASS — pointer and screenshot spaces agree.'
                    : '\nFAIL — pointer and screenshot spaces disagree.')
  process.exit(allOk ? 0 : 1)
}

main().catch(err => {
  console.error(`calibrate failed: ${err.message}`)
  process.exit(1)
})
