/**
 * @ks-jarvis/computer-use-swift
 *
 * macOS screenshot and app-management for CLI computer-use.
 * Implemented via screencapture, osascript (JXA/AppKit), mdfind, sips.
 * No native addons required. Requires Screen Recording + Accessibility permissions.
 *
 * Interface mirrors Anthropic's @ant/computer-use-swift (Swift NAPI).
 * All @MainActor methods from the original are just regular async functions here;
 * no CFRunLoop draining needed (libuv drives our Promises normally).
 */

import { execFileSync, execFile } from 'child_process'
import { readFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

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

// ── Display info (sync, cached) ────────────────────────────────────────────

let _displayCache = null

function refreshDisplayInfo() {
  const out = jxaSync(`
    ObjC.import("AppKit");
    var screens = $.NSScreen.screens;
    var result = [];
    for (var i = 0; i < screens.count; i++) {
      var s = screens.objectAtIndex(i);
      var f = s.frame;
      result.push({
        width: f.size.width,
        height: f.size.height,
        scaleFactor: s.backingScaleFactor
      });
    }
    JSON.stringify(result);
  `)
  _displayCache = JSON.parse(out)
  return _displayCache
}

function getDisplayInfo() {
  return _displayCache ?? refreshDisplayInfo()
}

// ── Screenshot helpers ─────────────────────────────────────────────────────

let _ssSeq = 0

function tempPath(ext = 'jpg') {
  return join(tmpdir(), `cu_ss_${Date.now()}_${_ssSeq++}.${ext}`)
}

function safeUnlink(p) {
  try { if (existsSync(p)) unlinkSync(p) } catch { /* ignore */ }
}

/**
 * Take a full-screen JPEG screenshot and return it as base64.
 * Uses screencapture (always native Retina resolution) then sips to resize
 * to the requested targetW×targetH.
 */
async function screenshotToBase64(targetW, targetH, displayId) {
  const path = tempPath()
  // screencapture -D uses 1-indexed display numbers; our displayId is 0-indexed
  const displayArgs = (displayId != null && displayId > 0) ? ['-D', String(displayId + 1)] : []
  try {
    await execFileAsync('screencapture', ['-t', 'jpg', '-x', ...displayArgs, path])

    // Check actual dims
    const dimsOut = execFileSync(
      'sips',
      ['-g', 'pixelWidth', '-g', 'pixelHeight', path],
      { encoding: 'utf8' },
    )
    const actualW = parseInt(dimsOut.match(/pixelWidth:\s*(\d+)/)?.[1] ?? targetW)
    const actualH = parseInt(dimsOut.match(/pixelHeight:\s*(\d+)/)?.[1] ?? targetH)

    let finalPath = path
    if (actualW !== targetW || actualH !== targetH) {
      const resized = tempPath()
      await execFileAsync('sips', [
        '-z', String(targetH), String(targetW), path, '--out', resized,
      ])
      safeUnlink(path)
      finalPath = resized
    }

    const base64 = readFileSync(finalPath).toString('base64')
    safeUnlink(finalPath)
    return { base64, width: targetW, height: targetH }
  } catch (err) {
    safeUnlink(path)
    throw err
  }
}

/**
 * Capture a region of the screen (logical coordinates) and return as base64 JPEG.
 */
async function captureRegionToBase64(x, y, w, h, outW, outH) {
  const path = tempPath()
  try {
    // -R x,y,w,h uses logical screen coordinates
    await execFileAsync('screencapture', [
      '-t', 'jpg', '-x',
      '-R', `${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`,
      path,
    ])

    const dimsOut = execFileSync(
      'sips',
      ['-g', 'pixelWidth', '-g', 'pixelHeight', path],
      { encoding: 'utf8' },
    )
    const actualW = parseInt(dimsOut.match(/pixelWidth:\s*(\d+)/)?.[1] ?? outW)
    const actualH = parseInt(dimsOut.match(/pixelHeight:\s*(\d+)/)?.[1] ?? outH)

    let finalPath = path
    if (actualW !== outW || actualH !== outH) {
      const resized = tempPath()
      await execFileAsync('sips', [
        '-z', String(outH), String(outW), path, '--out', resized,
      ])
      safeUnlink(path)
      finalPath = resized
    }

    const base64 = readFileSync(finalPath).toString('base64')
    safeUnlink(finalPath)
    return { base64, width: outW, height: outH }
  } catch (err) {
    safeUnlink(path)
    throw err
  }
}

// ── Exported API ───────────────────────────────────────────────────────────

/**
 * No-op: the original Swift implementation pumps CFRunLoop so @MainActor
 * methods can resolve under libuv. Our JS implementation uses normal async
 * functions — no pump needed.
 */
export function _drainMainRunLoop() {
  // intentional no-op
}

export const tcc = {
  /** Check macOS Accessibility (AX) permission. */
  checkAccessibility() {
    try {
      const out = jxaSync(`
        ObjC.import("ApplicationServices");
        String($.AXIsProcessTrusted());
      `)
      return out === 'true'
    } catch {
      return true // assume granted; operations will fail naturally if not
    }
  },

  /** Check macOS Screen Recording permission by attempting a screencapture. */
  checkScreenRecording() {
    const testPath = join(tmpdir(), 'cu_tcc_test.jpg')
    try {
      execFileSync('screencapture', ['-t', 'jpg', '-x', testPath], {
        timeout: 3000,
      })
      safeUnlink(testPath)
      return true
    } catch {
      safeUnlink(testPath)
      return false
    }
  },
}

export const display = {
  /** Get logical dimensions + scaleFactor for the given display (0 = main). */
  getSize(displayId) {
    const screens = getDisplayInfo()
    const idx = displayId != null && displayId < screens.length ? displayId : 0
    return screens[idx] ?? screens[0]
  },

  /** List all displays. */
  listAll() {
    return getDisplayInfo()
  },
}

export const screenshot = {
  /**
   * Capture the screen, excluding (or filtering for) the given bundle IDs.
   * @param {string[]} allowedBundleIds - apps to bring to front before capturing
   * @param {number} _quality - JPEG quality (0-1); screencapture uses its own default
   * @param {number} targetW - desired output width in pixels
   * @param {number} targetH - desired output height in pixels
   * @param {number} [displayId] - 0-indexed display to capture (0 = main, 1 = first external, …)
   */
  async captureExcluding(allowedBundleIds, _quality, targetW, targetH, displayId) {
    // Activate the first allowed app so the screenshot shows the target, not the terminal
    if (allowedBundleIds?.length > 0) {
      try {
        await execFileAsync('osascript', [
          '-e', `tell application id "${allowedBundleIds[0]}" to activate`,
        ], { timeout: 2000 })
        await new Promise(r => setTimeout(r, 300))
      } catch (_) {}
    }
    return screenshotToBase64(targetW, targetH, displayId)
  },

  /**
   * Capture a screen region.
   * x, y, w, h are in LOGICAL point coordinates (not physical pixels).
   */
  async captureRegion(_allowedBundleIds, x, y, w, h, outW, outH, _quality, _displayId) {
    return captureRegionToBase64(x, y, w, h, outW, outH)
  },
}

export const apps = {
  /**
   * Hide non-allowlisted apps before performing an action.
   * Returns the list of hidden bundle IDs (simplified: returns empty array).
   */
  async prepareDisplay(_allowlistBundleIds, _surrogateHost, _displayId) {
    // Full hide logic requires private APIs; return empty to skip hiding
    return { hidden: [], activated: undefined }
  },

  /** Preview which apps would be hidden (simplified: returns empty array). */
  previewHideSet(_bundleIds, _displayId) {
    return []
  },

  /** Find which displays each app's windows are on (simplified). */
  findWindowDisplays(_bundleIds) {
    return []
  },

  /** Find the app whose window is at (x, y) in logical coords. */
  appUnderPoint(_x, _y) {
    return null
  },

  /** List installed applications via Spotlight. */
  async listInstalled() {
    try {
      const { stdout } = await execFileAsync(
        'mdfind',
        ['kMDItemContentType == "com.apple.application-bundle"'],
        { timeout: 5000 },
      )
      const paths = stdout.trim().split('\n').filter(Boolean).slice(0, 200)
      const result = []
      for (const appPath of paths) {
        try {
          const info = execFileSync(
            'mdls',
            [
              '-name', 'kMDItemCFBundleIdentifier',
              '-name', 'kMDItemDisplayName',
              '-raw',
              appPath,
            ],
            { encoding: 'utf8', timeout: 1000 },
          )
          const parts = info.split('\n').map(s => s.trim()).filter(Boolean)
          if (parts.length >= 2 && parts[0] && parts[0] !== '(null)') {
            result.push({
              bundleId: parts[0],
              displayName: parts[1] || '',
              path: appPath,
            })
          }
        } catch { /* skip unreadable app */ }
      }
      return result
    } catch {
      return []
    }
  },

  /** List running UI applications (activation policy = regular). */
  async listRunning() {
    try {
      const out = jxaSync(`
        ObjC.import("AppKit");
        var apps = $.NSWorkspace.sharedWorkspace.runningApplications;
        var result = [];
        for (var i = 0; i < apps.count; i++) {
          var app = apps.objectAtIndex(i);
          if (app.activationPolicy === $.NSApplicationActivationPolicyRegular) {
            var bid = app.bundleIdentifier ? ObjC.unwrap(app.bundleIdentifier) : null;
            var name = app.localizedName ? ObjC.unwrap(app.localizedName) : null;
            if (bid) result.push({bundleId: bid, displayName: name || ""});
          }
        }
        JSON.stringify(result);
      `)
      return JSON.parse(out)
    } catch {
      return []
    }
  },

  /** Returns null (icon fetching not implemented). */
  iconDataUrl(_path) {
    return null
  },

  /** Unhide the listed apps. */
  async unhide(bundleIds) {
    if (!bundleIds.length) return
    const idsJson = JSON.stringify(bundleIds)
    await jxa(`
      ObjC.import("AppKit");
      var ids = ${idsJson};
      var runningApps = $.NSWorkspace.sharedWorkspace.runningApplications;
      for (var i = 0; i < runningApps.count; i++) {
        var app = runningApps.objectAtIndex(i);
        var bid = app.bundleIdentifier ? ObjC.unwrap(app.bundleIdentifier) : null;
        if (bid && ids.indexOf(bid) !== -1) {
          app.unhide();
        }
      }
      "ok"
    `)
  },

  /** Open an application by bundle ID. */
  async open(bundleId) {
    await execFileAsync('open', ['-b', bundleId])
  },
}

/**
 * Resolve which display to capture and optionally prepare the capture context.
 * Simplified: returns the display info and marks ready.
 */
export async function resolvePrepareCapture(
  _allowedBundleIds,
  _surrogateHost,
  _quality,
  _targetW,
  _targetH,
  preferredDisplayId,
  _autoResolve,
  _doHide,
) {
  return {
    displayId: preferredDisplayId ?? 0,
    ready: true,
  }
}
