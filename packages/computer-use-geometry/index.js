/**
 * @ks-jarvis/computer-use-geometry
 *
 * Single source of truth for display geometry and coordinate conversion.
 *
 * macOS exposes three different coordinate spaces. Mixing them is what caused
 * pointer coordinates to disagree with screenshot coordinates, so this module
 * is the ONLY place allowed to convert between them:
 *
 *   1. Screenshot space — top-left origin, 0..width × 0..height of the JPEG we
 *      hand back to the model. This is the PUBLIC MCP API space.
 *
 *   2. Global points — top-left origin, y grows downward. This is the space used
 *      by CGWarpMouseCursorPosition, CGEventCreateMouseEvent and
 *      `screencapture -R`. All pointer input happens here.
 *
 *   3. Device pixels — points × backingScaleFactor. Only ever used to decide how
 *      many pixels a capture contains. NEVER used for pointer input.
 *
 * NSScreen reports frames in points with a BOTTOM-LEFT origin (y grows upward),
 * so each frame is flipped into the CG top-left space when it is read.
 *
 * Note that the screenshot→points conversion below never references
 * backingScaleFactor: the scale factor is already fully absorbed by the
 * screenshot's own pixel dimensions. That is what keeps this correct on Retina,
 * non-Retina, and mixed-DPI multi-display setups without a hard-coded factor.
 */

import { execFileSync } from 'child_process'

// Upper bound on the image we return to the model. Captures are downscaled to
// fit inside this box, preserving aspect ratio.
export const MAX_SCREENSHOT_W = 1280
export const MAX_SCREENSHOT_H = 800

/**
 * Scale (w, h) down to fit inside MAX_SCREENSHOT_W × MAX_SCREENSHOT_H,
 * preserving aspect ratio. Never scales up.
 */
export function fitWithin(w, h, maxW = MAX_SCREENSHOT_W, maxH = MAX_SCREENSHOT_H) {
  const scale = Math.min(maxW / w, maxH / h, 1)
  return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))]
}

// ── Display enumeration ────────────────────────────────────────────────────

let _displayCache = null

const GEOMETRY_JXA = `
  ObjC.import("AppKit");
  var screens = $.NSScreen.screens;
  var primary = screens.objectAtIndex(0).frame;
  var flipBase = primary.origin.y + primary.size.height;
  var out = [];
  for (var i = 0; i < screens.count; i++) {
    var s = screens.objectAtIndex(i);
    var f = s.frame;
    var sf = s.backingScaleFactor;
    var num = s.deviceDescription.objectForKey("NSScreenNumber");
    out.push({
      index: i,
      cgDisplayId: num ? Number(ObjC.unwrap(num)) : null,
      scaleFactor: sf,
      // NSScreen frame is bottom-left origin; flip into CG top-left space.
      points: {
        x: f.origin.x,
        y: flipBase - (f.origin.y + f.size.height),
        w: f.size.width,
        h: f.size.height
      }
    });
  }
  JSON.stringify(out);
`

function readDisplays() {
  const out = execFileSync('osascript', ['-l', 'JavaScript', '-e', GEOMETRY_JXA], {
    encoding: 'utf8',
  }).trim()
  const raw = JSON.parse(out)
  return raw.map(d => ({
    ...d,
    pixels: {
      w: Math.round(d.points.w * d.scaleFactor),
      h: Math.round(d.points.h * d.scaleFactor),
    },
  }))
}

/** Re-read display geometry from the window server (call on hot-plug). */
export function refreshDisplays() {
  _displayCache = readDisplays()
  return _displayCache
}

/** All displays, index 0 = primary (menu-bar) display. Cached. */
export function getDisplays() {
  return _displayCache ?? refreshDisplays()
}

/** One display by 0-based index; falls back to the primary display. */
export function getDisplay(displayId) {
  const all = getDisplays()
  const idx = displayId != null && displayId >= 0 && displayId < all.length ? displayId : 0
  return all[idx] ?? all[0]
}

/** The display whose point rect contains (px, py), or null. */
export function displayContainingPoint(px, py) {
  for (const d of getDisplays()) {
    const { x, y, w, h } = d.points
    if (px >= x && px < x + w && py >= y && py < y + h) return d
  }
  return null
}

/**
 * Screenshot dimensions for a display: its native pixel size, capped to the
 * MAX_SCREENSHOT box. Screenshot size and pointer mapping both derive from this
 * same record, which is what keeps the two spaces consistent.
 */
export function screenshotSize(display) {
  const [width, height] = fitWithin(display.pixels.w, display.pixels.h)
  return { width, height }
}

// ── The conversions ────────────────────────────────────────────────────────

/**
 * Screenshot space → global points (the space CG mouse APIs and
 * `screencapture -R` use). This is the single conversion applied to every
 * incoming public coordinate.
 *
 * @param {number} x - screenshot x, 0 = left edge, shot.width = right edge
 * @param {number} y - screenshot y, 0 = top edge, shot.height = bottom edge
 * @param {{width:number,height:number}} shot - screenshot dimensions
 * @param {object} display - a record from getDisplay()
 */
export function screenshotToPoints(x, y, shot, display) {
  return {
    x: display.points.x + (x * display.points.w) / shot.width,
    y: display.points.y + (y * display.points.h) / shot.height,
  }
}

/** Global points → screenshot space. Inverse of screenshotToPoints. */
export function pointsToScreenshot(px, py, shot, display) {
  return {
    x: ((px - display.points.x) * shot.width) / display.points.w,
    y: ((py - display.points.y) * shot.height) / display.points.h,
  }
}

/**
 * A rect in global points centred on a screenshot-space coordinate, sized in
 * screenshot units so the zoom level is independent of display scale.
 * Clamped to stay inside the display.
 */
export function zoomRegionPoints(x, y, shot, display, boxShotPx) {
  const halfW = (boxShotPx / 2) * (display.points.w / shot.width)
  const halfH = (boxShotPx / 2) * (display.points.h / shot.height)
  const c = screenshotToPoints(x, y, shot, display)
  const w = Math.min(halfW * 2, display.points.w)
  const h = Math.min(halfH * 2, display.points.h)
  const maxX = display.points.x + display.points.w - w
  const maxY = display.points.y + display.points.h - h
  return {
    x: Math.min(Math.max(c.x - w / 2, display.points.x), maxX),
    y: Math.min(Math.max(c.y - h / 2, display.points.y), maxY),
    w,
    h,
  }
}
