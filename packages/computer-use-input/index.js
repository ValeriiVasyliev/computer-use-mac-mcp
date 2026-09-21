/**
 * @ks-jarvis/computer-use-input
 *
 * macOS mouse/keyboard control implemented via osascript (JXA + CoreGraphics).
 * No native addons required. Requires macOS Accessibility permission.
 *
 * Interface mirrors Anthropic's @ant/computer-use-input (Rust/enigo NAPI).
 * Drop-in replacement for CLI computer-use flows.
 */

import { execFileSync, execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// ── macOS virtual key codes ────────────────────────────────────────────────
const KEY_CODES = {
  a: 0, s: 1, d: 2, f: 3, h: 4, g: 5, z: 6, x: 7,
  c: 8, v: 9, b: 11, q: 12, w: 13, e: 14, r: 15,
  y: 16, t: 17, '1': 18, '2': 19, '3': 20, '4': 21, '6': 22,
  '5': 23, '=': 24, '9': 25, '7': 26, '-': 27, '8': 28, '0': 29,
  ']': 30, o: 31, u: 32, '[': 33, i: 34, p: 35,
  return: 36, enter: 36, l: 37, j: 38, "'": 39,
  k: 40, ';': 41, '\\': 42, ',': 43, '/': 44, n: 45, m: 46,
  '.': 47, tab: 48, space: 49, '`': 50,
  backspace: 51, delete: 51,
  escape: 53, esc: 53,
  // modifier key codes (used by key() for press/release)
  command: 55, cmd: 55,
  shift: 56, capslock: 57,
  option: 58, alt: 58,
  control: 59, ctrl: 59,
  // function keys
  f5: 96, f6: 97, f7: 98, f3: 99, f8: 100, f9: 101,
  f11: 103, f13: 105, f16: 106, f14: 107, f10: 109,
  f12: 111, f15: 113, help: 114, home: 115,
  page_up: 116, pageup: 116, forward_delete: 117,
  f4: 118, end: 119, f2: 120,
  page_down: 121, pagedown: 121,
  f1: 122, left: 123, right: 124, down: 125, up: 126,
}

// CGEventFlags for modifier keys
const MODIFIER_FLAGS = {
  command: 0x100000, cmd: 0x100000,
  shift: 0x20000,
  option: 0x80000, alt: 0x80000,
  control: 0x40000, ctrl: 0x40000,
  fn: 0x800000,
}

const IS_MODIFIER = new Set(Object.keys(MODIFIER_FLAGS))

// ── osascript helpers ──────────────────────────────────────────────────────

function jxa(script) {
  return execFileAsync('osascript', ['-l', 'JavaScript', '-e', script])
}

function jxaSync(script) {
  return execFileSync(
    'osascript',
    ['-l', 'JavaScript', '-e', script],
    { encoding: 'utf8' },
  ).trim()
}

// ── Cursor position helpers ────────────────────────────────────────────────
//
// Everything in this module speaks GLOBAL POINTS (top-left origin) — the native
// coordinate space of the CoreGraphics event APIs below. It deliberately knows
// nothing about Retina scale factors or screenshot dimensions; converting from
// the public screenshot space happens exactly once, in computer-use-geometry.

function getCursorLogical() {
  const out = jxaSync(`
    ObjC.import("CoreGraphics");
    var e = $.CGEventCreate(null);
    var p = $.CGEventGetLocation(e);
    JSON.stringify({x: p.x, y: p.y});
  `)
  return JSON.parse(out)
}

// ── Exported API ───────────────────────────────────────────────────────────

/** Discriminant: true → platform supported */
export const isSupported = true

/**
 * Move the mouse cursor to (x, y) in GLOBAL POINTS (top-left origin) — the
 * coordinate space CGWarpMouseCursorPosition itself uses. No scaling is applied
 * here; callers convert from screenshot space via computer-use-geometry.
 */
export async function moveMouse(x, y, _interpolated) {
  await jxa(`
    ObjC.import("CoreGraphics");
    $.CGWarpMouseCursorPosition({x: ${x}, y: ${y}});
    $.CGAssociateMouseAndMouseCursorPosition(1);
  `)
}

/**
 * Press, release, or click a mouse button at the current cursor position.
 * @param {number} [count=1] - click count (1 = single, 2 = double, 3 = triple)
 */
export async function mouseButton(button, action, count) {
  const pos = getCursorLogical()
  const n = count ?? 1

  const [downType, upType, btn] =
    button === 'left'
      ? ['$.kCGEventLeftMouseDown', '$.kCGEventLeftMouseUp', '$.kCGMouseButtonLeft']
      : button === 'right'
      ? ['$.kCGEventRightMouseDown', '$.kCGEventRightMouseUp', '$.kCGMouseButtonRight']
      : ['$.kCGEventOtherMouseDown', '$.kCGEventOtherMouseUp', '$.kCGMouseButtonCenter']

  if (action === 'click') {
    await jxa(`
      ObjC.import("CoreGraphics");
      var pos = {x: ${pos.x}, y: ${pos.y}};
      for (var i = 0; i < ${n}; i++) {
        var d = $.CGEventCreateMouseEvent(null, ${downType}, pos, ${btn});
        $.CGEventSetIntegerValueField(d, $.kCGMouseEventClickState, i + 1);
        $.CGEventPost($.kCGHIDEventTap, d);
        delay(0.05);
        var u = $.CGEventCreateMouseEvent(null, ${upType}, pos, ${btn});
        $.CGEventSetIntegerValueField(u, $.kCGMouseEventClickState, i + 1);
        $.CGEventPost($.kCGHIDEventTap, u);
        if (i < ${n} - 1) delay(0.05);
      }
      "ok"
    `)
  } else if (action === 'press') {
    await jxa(`
      ObjC.import("CoreGraphics");
      var d = $.CGEventCreateMouseEvent(null, ${downType}, {x: ${pos.x}, y: ${pos.y}}, ${btn});
      $.CGEventPost($.kCGHIDEventTap, d);
      "ok"
    `)
  } else {
    // release
    await jxa(`
      ObjC.import("CoreGraphics");
      var u = $.CGEventCreateMouseEvent(null, ${upType}, {x: ${pos.x}, y: ${pos.y}}, ${btn});
      $.CGEventPost($.kCGHIDEventTap, u);
      "ok"
    `)
  }
}

/**
 * Scroll at the current cursor position.
 * Positive amount = scroll up (vertical) or right (horizontal).
 */
export async function mouseScroll(amount, axis) {
  const dy = axis === 'vertical' ? -amount : 0
  const dx = axis === 'horizontal' ? -amount : 0
  await jxa(`
    ObjC.import("CoreGraphics");
    var ev = $.CGEventCreateScrollWheelEvent(null, $.kCGScrollEventUnitLine, 2, ${dy}, ${dx});
    $.CGEventPost($.kCGHIDEventTap, ev);
    "ok"
  `)
}

/**
 * Returns the current cursor position in GLOBAL POINTS (top-left origin).
 * Callers convert to screenshot space via computer-use-geometry.
 */
export async function mouseLocation() {
  return getCursorLogical()
}

/**
 * Press or release a single key by name (used by holdKey for modifier tracking).
 */
export async function key(name, action) {
  const lower = name.toLowerCase()
  const keyCode = KEY_CODES[lower]
  if (keyCode === undefined) throw new Error(`Unknown key: ${name}`)
  const isDown = action === 'press'
  await jxa(`
    ObjC.import("CoreGraphics");
    var ev = $.CGEventCreateKeyboardEvent(null, ${keyCode}, ${isDown});
    $.CGEventPost($.kCGHIDEventTap, ev);
    "ok"
  `)
}

/**
 * Press a key combination simultaneously, e.g. keys(['command', 'v']) → Cmd+V.
 * Modifiers are held while the main key fires.
 */
export async function keys(parts) {
  const lower = parts.map(p => p.toLowerCase())
  const mods = lower.filter(p => IS_MODIFIER.has(p))
  const mainKeys = lower.filter(p => !IS_MODIFIER.has(p))

  // Compute combined modifier flags
  let flags = 0
  for (const m of mods) flags |= (MODIFIER_FLAGS[m] || 0)

  if (mainKeys.length === 0) {
    // Pure modifier press/release (e.g. keys(['shift']))
    for (const m of mods) await key(m, 'press')
    await new Promise(r => setTimeout(r, 50))
    for (const m of [...mods].reverse()) await key(m, 'release')
    return
  }

  const mainKey = mainKeys[0]
  const keyCode = KEY_CODES[mainKey]

  if (keyCode !== undefined) {
    // Use CGEvent with flags for reliable modifier+key combos
    await jxa(`
      ObjC.import("CoreGraphics");
      var down = $.CGEventCreateKeyboardEvent(null, ${keyCode}, true);
      $.CGEventSetFlags(down, ${flags});
      var up = $.CGEventCreateKeyboardEvent(null, ${keyCode}, false);
      $.CGEventSetFlags(up, ${flags});
      $.CGEventPost($.kCGHIDEventTap, down);
      $.CGEventPost($.kCGHIDEventTap, up);
      "ok"
    `)
  } else {
    // Fallback: AppleScript keystroke for characters not in the key-code table
    const modsAS = mods.map(m => {
      const map = {
        command: 'command', cmd: 'command',
        control: 'control', ctrl: 'control',
        shift: 'shift',
        option: 'option', alt: 'option',
      }
      return `${map[m] || m} down`
    }).join(', ')
    const usingClause = modsAS ? ` using {${modsAS}}` : ''
    const escaped = mainKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    await execFileAsync('osascript', [
      '-e',
      `tell application "System Events" to keystroke "${escaped}"${usingClause}`,
    ])
  }
}

/**
 * Type a single grapheme (called once per character by executor.ts).
 * Uses System Events keystroke for reliable Unicode support.
 */
export async function typeText(text) {
  const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  await execFileAsync('osascript', [
    '-e',
    `tell application "System Events" to keystroke "${escaped}"`,
  ])
}

/**
 * Returns the frontmost application info synchronously.
 * Returns null if unavailable.
 */
export function getFrontmostAppInfo() {
  try {
    const out = jxaSync(`
      ObjC.import("AppKit");
      var app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
      if (!app || app.isNil()) {
        JSON.stringify(null);
      } else {
        var bid = app.bundleIdentifier ? ObjC.unwrap(app.bundleIdentifier) : "";
        var name = app.localizedName ? ObjC.unwrap(app.localizedName) : "";
        JSON.stringify({bundleId: bid, appName: name});
      }
    `)
    if (!out || out === 'null') return null
    return JSON.parse(out)
  } catch {
    return null
  }
}
