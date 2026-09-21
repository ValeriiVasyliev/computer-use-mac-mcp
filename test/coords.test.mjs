/**
 * Coordinate conversion tests.
 *
 * These are pure geometry — no input is posted and no windows are touched, so
 * the suite is safe to run on a live desktop.
 *
 * Run: npm test
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  fitWithin,
  screenshotToPoints,
  pointsToScreenshot,
  zoomRegionPoints,
  screenshotSize,
} from '../packages/computer-use-geometry/index.js'

/** Build a synthetic display record without touching the window server. */
function display({ x = 0, y = 0, w, h, sf }) {
  return {
    index: 0,
    cgDisplayId: 1,
    scaleFactor: sf,
    points: { x, y, w, h },
    pixels: { w: Math.round(w * sf), h: Math.round(h * sf) },
  }
}

const RETINA = display({ w: 1512, h: 982, sf: 2 })        // MacBook Pro 14"
const NON_RETINA = display({ w: 1920, h: 1080, sf: 1 })   // typical external
const SCALED_5K = display({ w: 2560, h: 1440, sf: 2 })    // 5K in scaled mode

test('fitWithin caps to the 1280x800 box preserving aspect ratio', () => {
  assert.deepEqual(fitWithin(3024, 1964), [1232, 800])
  assert.deepEqual(fitWithin(1920, 1080), [1280, 720])
  // never upscales
  assert.deepEqual(fitWithin(800, 600), [800, 600])
})

test('screenshot centre maps to the display centre in points (Retina)', () => {
  const shot = screenshotSize(RETINA)
  assert.deepEqual(shot, { width: 1232, height: 800 })
  const pt = screenshotToPoints(shot.width / 2, shot.height / 2, shot, RETINA)
  assert.equal(pt.x, 756)
  assert.equal(pt.y, 491)
})

test('screenshot centre maps to the display centre on a non-Retina display', () => {
  const shot = screenshotSize(NON_RETINA)
  const pt = screenshotToPoints(shot.width / 2, shot.height / 2, shot, NON_RETINA)
  assert.equal(pt.x, 960)
  assert.equal(pt.y, 540)
})

test('conversion never applies a hard-coded 2x factor', () => {
  // Two displays of identical logical size but different backing scale must
  // produce identical point mappings: the scale factor is absorbed entirely by
  // the screenshot's own dimensions, so it must not appear in the conversion.
  const a = display({ w: 1440, h: 900, sf: 1 })
  const b = display({ w: 1440, h: 900, sf: 2 })
  const sa = screenshotSize(a)
  const sb = screenshotSize(b)

  for (const [fx, fy] of [[0, 0], [0.25, 0.5], [0.5, 0.5], [1, 1]]) {
    const pa = screenshotToPoints(fx * sa.width, fy * sa.height, sa, a)
    const pb = screenshotToPoints(fx * sb.width, fy * sb.height, sb, b)
    assert.ok(Math.abs(pa.x - pb.x) < 1e-9 && Math.abs(pa.y - pb.y) < 1e-9,
      `scale factor must not affect the mapping: ${JSON.stringify(pa)} vs ${JSON.stringify(pb)}`)
  }

  // A pixel on a denser (uncapped) screenshot covers fewer points.
  const small = display({ w: 800, h: 500, sf: 1 })
  const dense = display({ w: 800, h: 500, sf: 2 })
  const ss = screenshotSize(small)
  const sd = screenshotSize(dense)
  assert.ok(sd.width > ss.width, 'denser display yields a larger screenshot')
  assert.ok(screenshotToPoints(10, 0, ss, small).x > screenshotToPoints(10, 0, sd, dense).x)
})

test('corners map to the display rect corners', () => {
  for (const d of [RETINA, NON_RETINA, SCALED_5K]) {
    const shot = screenshotSize(d)
    assert.deepEqual(screenshotToPoints(0, 0, shot, d), { x: d.points.x, y: d.points.y })
    assert.deepEqual(
      screenshotToPoints(shot.width, shot.height, shot, d),
      { x: d.points.x + d.points.w, y: d.points.y + d.points.h },
    )
  }
})

test('round-trip screenshot -> points -> screenshot is identity', () => {
  for (const d of [RETINA, NON_RETINA, SCALED_5K]) {
    const shot = screenshotSize(d)
    for (const [x, y] of [[0, 0], [1, 1], [616, 400], [shot.width, shot.height]]) {
      const pt = screenshotToPoints(x, y, shot, d)
      const back = pointsToScreenshot(pt.x, pt.y, shot, d)
      assert.ok(Math.abs(back.x - x) < 1e-9, `x round-trip ${x} -> ${back.x}`)
      assert.ok(Math.abs(back.y - y) < 1e-9, `y round-trip ${y} -> ${back.y}`)
    }
  }
})

test('secondary display origins are honoured', () => {
  // A 1080p display sitting to the right of a 1512-point primary.
  const secondary = display({ x: 1512, y: 0, w: 1920, h: 1080, sf: 1 })
  const shot = screenshotSize(secondary)
  const topLeft = screenshotToPoints(0, 0, shot, secondary)
  assert.deepEqual(topLeft, { x: 1512, y: 0 })
  const centre = screenshotToPoints(shot.width / 2, shot.height / 2, shot, secondary)
  assert.equal(centre.x, 1512 + 960)
  assert.equal(centre.y, 540)
})

test('display above the primary gets a negative y origin', () => {
  const above = display({ x: 0, y: -900, w: 1440, h: 900, sf: 1 })
  const shot = screenshotSize(above)
  assert.deepEqual(screenshotToPoints(0, 0, shot, above), { x: 0, y: -900 })
  assert.deepEqual(
    screenshotToPoints(shot.width, shot.height, shot, above), { x: 1440, y: 0 },
  )
})

test('zoom region stays inside the display and is sized in points', () => {
  const shot = screenshotSize(RETINA)
  const box = 200
  const r = zoomRegionPoints(shot.width / 2, shot.height / 2, shot, RETINA, box)
  // 200 screenshot px * (1512 points / 1232 px) ≈ 245.5 points
  assert.ok(Math.abs(r.w - box * (RETINA.points.w / shot.width)) < 1e-6)
  assert.ok(r.x >= RETINA.points.x && r.x + r.w <= RETINA.points.x + RETINA.points.w)
  assert.ok(r.y >= RETINA.points.y && r.y + r.h <= RETINA.points.y + RETINA.points.h)
})

test('zoom region at the edges is clamped, never outside the display', () => {
  const shot = screenshotSize(RETINA)
  for (const [x, y] of [[0, 0], [shot.width, shot.height], [0, shot.height]]) {
    const r = zoomRegionPoints(x, y, shot, RETINA, 200)
    assert.ok(r.x >= RETINA.points.x, `x ${r.x}`)
    assert.ok(r.y >= RETINA.points.y, `y ${r.y}`)
    assert.ok(r.x + r.w <= RETINA.points.x + RETINA.points.w + 1e-9, `right ${r.x + r.w}`)
    assert.ok(r.y + r.h <= RETINA.points.y + RETINA.points.h + 1e-9, `bottom ${r.y + r.h}`)
  }
})

test('regression: zoom never produces the out-of-bounds rect seen on Retina', () => {
  // Previously zoom converted to PIXELS and handed them to `screencapture -R`,
  // which takes points: centre (640,535) produced rect (1371,1113,400,400) on a
  // 1512x982-point display and failed with "does not intersect any displays".
  const shot = screenshotSize(RETINA)
  const r = zoomRegionPoints(640, 535, shot, RETINA, 200)
  assert.ok(r.x + r.w <= 1512 && r.y + r.h <= 982,
    `rect must fit the display, got (${r.x},${r.y},${r.w},${r.h})`)
})

test('regression: cursor_position round-trips inside screenshot bounds', () => {
  // Previously mouseLocation returned points*scaleFactor (device pixels), so a
  // cursor mid-screen reported y=1231 against an 800-tall screenshot.
  const shot = screenshotSize(RETINA)
  const mid = pointsToScreenshot(613, 615, shot, RETINA)
  assert.ok(mid.x >= 0 && mid.x <= shot.width, `x in range: ${mid.x}`)
  assert.ok(mid.y >= 0 && mid.y <= shot.height, `y in range: ${mid.y}`)
})
