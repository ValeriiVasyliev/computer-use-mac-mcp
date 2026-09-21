/**
 * @ks-jarvis/computer-use-mcp
 *
 * MCP server, tool definitions, and session dispatcher for Claude computer-use.
 * Provides drop-in replacement for Anthropic's @ant/computer-use-mcp on macOS.
 *
 * Three entry points:
 *   buildComputerUseTools   → list of MCP tool definitions (for ListTools)
 *   createComputerUseMcpServer → MCP Server instance (for stdio subprocess mode)
 *   bindSessionContext       → session dispatcher called per tool invocation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import * as geometry from '../computer-use-geometry/index.js'

/** Coordinate tracing is noisy; opt in with CU_DEBUG_COORDS=1. */
const DEBUG_COORDS = process.env.CU_DEBUG_COORDS === '1'
function traceCoords(msg) {
  if (DEBUG_COORDS) process.stderr.write(`[CU-COORD] ${msg}\n`)
}

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Default permission flags. All false = conservative defaults.
 * The user can grant clipboard/systemKey access via the request_access dialog.
 */
export const DEFAULT_GRANT_FLAGS = {
  clipboardRead: false,
  clipboardWrite: false,
  systemKeyCombos: false,
}

/**
 * Image resize parameters passed to targetImageSize.
 * Empty object = no additional constraints beyond physical dimensions.
 */
export const API_RESIZE_PARAMS = {}

/**
 * Side length of the zoom window, expressed in SCREENSHOT pixels. Converting it
 * through the display rect keeps the zoom factor identical on Retina and
 * non-Retina displays.
 */
export const ZOOM_BOX_SHOT_PX = 200

/** Sentinel category for apps that should never be controlled. Returns null. */
export function getSentinelCategory() {
  return null
}

/**
 * Compute the target image dimensions for a screenshot.
 * physW/physH = the display's native pixel dimensions.
 * We cap at 1280×800 to keep token costs reasonable while still giving
 * Claude a usable coordinate space.
 *
 * Delegates to computer-use-geometry so screenshot sizing and coordinate
 * mapping can never drift apart.
 */
export function targetImageSize(physW, physH, _params) {
  return geometry.fitWithin(physW, physH)
}

// ── Tool definitions ───────────────────────────────────────────────────────

function coord(mode) {
  const desc =
    mode === 'normalized'
      ? '0.0–1.0 fraction of display width/height'
      : 'pixel coordinate in the screenshot coordinate space'
  return {
    x: { type: 'number', description: `Horizontal position (${desc})` },
    y: { type: 'number', description: `Vertical position (${desc})` },
  }
}

function appListHint(installedAppNames) {
  if (!installedAppNames?.length) return ''
  const sample = installedAppNames.slice(0, 20).join(', ')
  return ` Some installed apps: ${sample}.`
}

/**
 * Build the MCP tool list for the given capabilities and coordinate mode.
 * @param {object} capabilities - executor capabilities (platform, etc.)
 * @param {'pixels'|'normalized'} mode - coordinate mode
 * @param {string[]} [installedAppNames] - hint for request_access description
 */
export function buildComputerUseTools(capabilities, mode, installedAppNames) {
  const xy = coord(mode)

  return [
    {
      name: 'screenshot',
      description:
        'Take a screenshot of the current state of the screen. ' +
        'Returns a JPEG image. Call this frequently to observe what is on screen.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'left_click',
      description: 'Click the left mouse button at the specified coordinates.',
      inputSchema: {
        type: 'object',
        properties: {
          ...xy,
          modifiers: {
            type: 'array',
            items: { type: 'string', enum: ['command', 'shift', 'option', 'control'] },
            description: 'Modifier keys to hold while clicking',
          },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'right_click',
      description: 'Click the right mouse button at the specified coordinates.',
      inputSchema: {
        type: 'object',
        properties: xy,
        required: ['x', 'y'],
      },
    },
    {
      name: 'middle_click',
      description: 'Click the middle mouse button at the specified coordinates.',
      inputSchema: {
        type: 'object',
        properties: xy,
        required: ['x', 'y'],
      },
    },
    {
      name: 'double_click',
      description: 'Double-click the left mouse button at the specified coordinates.',
      inputSchema: {
        type: 'object',
        properties: xy,
        required: ['x', 'y'],
      },
    },
    {
      name: 'left_click_drag',
      description: 'Click and drag the mouse from start_coordinate to coordinate.',
      inputSchema: {
        type: 'object',
        properties: {
          coordinate: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
            description: 'Destination [x, y]',
          },
          start_coordinate: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
            description: 'Start position [x, y] (omit to drag from current cursor)',
          },
        },
        required: ['coordinate'],
      },
    },
    {
      name: 'type',
      description: 'Type text at the current cursor position. Works with any Unicode text.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['text'],
      },
    },
    {
      name: 'key',
      description:
        'Press a key or key combination. Use "+" to combine modifiers, e.g. "ctrl+c", "command+shift+z". ' +
        'Named keys: escape, return, tab, space, delete, up, down, left, right, f1–f12. ' +
        'IMPORTANT: On macOS, always prefer "command" over "ctrl" for standard shortcuts — ' +
        'e.g. use "command+a" (select-all), "command+c" (copy), NOT "ctrl+a"/"ctrl+c". ' +
        '"ctrl+a" and similar ctrl-shortcuts may trigger third-party app global hotkeys.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Key sequence, e.g. "ctrl+c"' },
          repeat: { type: 'number', description: 'Number of times to repeat (default 1)' },
        },
        required: ['text'],
      },
    },
    {
      name: 'hold_key',
      description: 'Hold one or more keys for a duration.',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key name to hold' },
          duration_ms: { type: 'number', description: 'Duration in milliseconds (default 1000)' },
        },
        required: ['key'],
      },
    },
    {
      name: 'mouse_move',
      description: 'Move the mouse cursor to the specified coordinates without clicking.',
      inputSchema: {
        type: 'object',
        properties: xy,
        required: ['x', 'y'],
      },
    },
    {
      name: 'scroll',
      description: 'Scroll the mouse wheel at the specified coordinates.',
      inputSchema: {
        type: 'object',
        properties: {
          ...xy,
          vertical_distance: {
            type: 'number',
            description: 'Vertical scroll distance (positive = up, negative = down)',
          },
          horizontal_distance: {
            type: 'number',
            description: 'Horizontal scroll distance (positive = right, negative = left)',
          },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'cursor_position',
      description: 'Get the current cursor position as {x, y} in screenshot coordinates.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'zoom',
      description: 'Take a zoomed-in screenshot of the area around the specified coordinate.',
      inputSchema: {
        type: 'object',
        properties: {
          coordinate: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
            description: 'Center of zoom region [x, y]',
          },
        },
        required: ['coordinate'],
      },
    },
    {
      name: 'request_access',
      description:
        'Request permission to control specific applications.' +
        ' Call this FIRST before any other computer-use tool.' +
        ' The user will approve or deny access for each app.' +
        appListHint(installedAppNames),
      inputSchema: {
        type: 'object',
        properties: {
          apps: {
            type: 'array',
            description: 'Applications to request access for',
            items: {
              type: 'object',
              properties: {
                bundleId: {
                  type: 'string',
                  description: 'macOS bundle ID, e.g. "com.apple.Safari"',
                },
                displayName: {
                  type: 'string',
                  description: 'Human-readable app name',
                },
              },
              required: ['bundleId'],
            },
          },
        },
        required: ['apps'],
      },
    },
    {
      name: 'switch_display',
      description: 'Switch the active display for subsequent screenshots and actions.',
      inputSchema: {
        type: 'object',
        properties: {
          display: {
            description: 'Display index (0-based) or "auto" to auto-select',
          },
        },
        required: ['display'],
      },
    },
  ]
}

// ── Subprocess Context ────────────────────────────────────────────────────

/**
 * Minimal ComputerUseSessionContext for standalone subprocess MCP server mode.
 * No UI, no lock management, no React context required.
 * - Auto-approves request_access (the calling agent is responsible for trust)
 * - Maintains screenshot dims + allowed-app list in memory for the process lifetime
 */
export function createSubprocessCtx() {
  let lastScreenshotDims = null
  let allowedApps = []
  let selectedDisplayId = undefined

  return {
    getLastScreenshotDims: () => lastScreenshotDims,
    onScreenshotCaptured: (dims) => { lastScreenshotDims = dims },
    getAllowedApps: () => allowedApps,
    // Subprocess has no contention — always report "self holds the lock"
    checkCuLock: async () => ({ holder: 'self', isSelf: true }),
    acquireCuLock: async () => {},
    formatLockHeldMessage: () => 'Computer use is locked by another session.',
    getSelectedDisplayId: () => selectedDisplayId,
    // Auto-approve: grant access to every app the agent requested
    onPermissionRequest: async (req) => ({
      granted: (req.apps ?? []).map(a => ({
        bundleId: a.bundleId,
        displayName: a.displayName || a.bundleId,
      })),
      flags: req.flags ?? {},
    }),
    onAllowedAppsChanged: (granted) => {
      for (const app of (granted ?? [])) {
        if (app.bundleId && !allowedApps.find(a => a.bundleId === app.bundleId)) {
          allowedApps.push({ bundleId: app.bundleId })
        }
      }
    },
    onDisplayPinned: (idx) => { selectedDisplayId = idx },
  }
}

// ── MCP Server ─────────────────────────────────────────────────────────────

/**
 * Create a minimal MCP Server for the computer-use capability.
 * The caller (mcpServer.ts) replaces the ListTools handler with one that
 * injects installed-app names into the request_access description.
 *
 * In the normal in-process flow, CallTool is intercepted by wrapper.tsx's
 * .call() override before reaching this server. The CallTool handler here
 * is only used in true subprocess mode (rare / debug only).
 */
export function createComputerUseMcpServer(adapter, coordinateMode) {
  process.stderr.write('[CU-DEBUG3] createComputerUseMcpServer called\n')
  const server = new Server(
    { name: 'computer-use', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  // Default ListTools — replaced by mcpServer.ts after construction
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    process.stderr.write('[CU-DEBUG3] ListTools handler called\n')
    if (adapter?.isDisabled?.()) return { tools: [] }
    const tools = buildComputerUseTools(
      adapter?.executor?.capabilities ?? {},
      coordinateMode ?? 'pixels',
    )
    return { tools }
  })

  // CallTool — only reached in subprocess mode; in-process uses wrapper.tsx
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    return {
      content: [
        {
          type: 'text',
          text: `[computer-use] Tool ${name} called in subprocess mode (args: ${JSON.stringify(args)})`,
        },
      ],
    }
  })

  return server
}

// ── Session Dispatcher (bindSessionContext) ────────────────────────────────

/**
 * Bind the host adapter + session context and return a tool-call dispatcher.
 *
 * @param {object} adapter - ComputerUseHostAdapter (executor, logger, isDisabled, …)
 * @param {'pixels'|'normalized'} coordinateMode - coordinate space for x/y args
 * @param {object} ctx - ComputerUseSessionContext (state accessors + callbacks)
 * @returns {(toolName: string, args: unknown) => Promise<CuCallToolResult>}
 */
export function bindSessionContext(adapter, coordinateMode, ctx) {
  const { executor } = adapter

  /**
   * The screenshot dimensions that incoming coordinates are expressed in.
   *
   * Prefers the dims of the screenshot the model actually saw. If no screenshot
   * has been taken yet, it is derived from live display geometry rather than
   * passing coordinates through unconverted (which silently produced
   * off-by-scaleFactor pointer positions).
   */
  function currentShot(displayId) {
    const cached = ctx.getLastScreenshotDims?.()
    if (cached && cached.width > 0 && cached.height > 0 &&
        (cached.displayId ?? 0) === (displayId ?? 0)) {
      return { width: cached.width, height: cached.height }
    }
    return geometry.screenshotSize(geometry.getDisplay(displayId))
  }

  /**
   * Convert a public API coordinate into GLOBAL POINTS — the space the CG mouse
   * APIs and `screencapture -R` use. This is the one and only conversion applied
   * to incoming coordinates.
   */
  function toPoints(x, y, displayId) {
    const display = geometry.getDisplay(displayId)
    const shot = currentShot(displayId)

    // normalized mode addresses the display as a 0..1 fraction
    const sx = coordinateMode === 'normalized' ? x * shot.width : x
    const sy = coordinateMode === 'normalized' ? y * shot.height : y

    const pt = geometry.screenshotToPoints(sx, sy, shot, display)
    traceCoords(
      `toPoints in=(${x},${y}) mode=${coordinateMode} shot=${shot.width}x${shot.height} ` +
      `display#${display.index} rect=(${display.points.x},${display.points.y},` +
      `${display.points.w},${display.points.h}) sf=${display.scaleFactor} => points=(${pt.x.toFixed(1)},${pt.y.toFixed(1)})`,
    )
    return pt
  }

  function getAllowedBundleIds() {
    return (ctx.getAllowedApps() ?? []).map(a => a.bundleId)
  }

  function ok(text) {
    return { content: [{ type: 'text', text }], telemetry: {} }
  }

  return async function dispatch(toolName, args) {
    const a = (args ?? {})

    // ── Lock check ─────────────────────────────────────────────────────────
    const lockState = await ctx.checkCuLock()
    if (lockState.holder !== undefined && !lockState.isSelf) {
      return {
        content: [{ type: 'text', text: ctx.formatLockHeldMessage(lockState.holder) }],
        telemetry: { error_kind: 'lock_held' },
      }
    }
    // request_access defers lock acquisition (no physical action yet)
    if (toolName !== 'request_access' && lockState.holder === undefined) {
      await ctx.acquireCuLock()
    }

    if (adapter.isDisabled()) {
      return {
        content: [{ type: 'text', text: 'Computer use is disabled.' }],
        telemetry: { error_kind: 'disabled' },
      }
    }

    const displayId = ctx.getSelectedDisplayId()

    try {
      switch (toolName) {
        // ── screenshot ─────────────────────────────────────────────────────
        case 'screenshot': {
          const allowedBundleIds = getAllowedBundleIds()
          const result = await executor.screenshot({ allowedBundleIds, displayId })

          // Record the geometry this screenshot was taken against so that
          // subsequent coordinates are mapped against the very same rect.
          const display = geometry.getDisplay(displayId)
          const storedDims = {
            width: result.width,
            height: result.height,
            displayWidth: display.pixels.w,
            displayHeight: display.pixels.h,
            pointsWidth: display.points.w,
            pointsHeight: display.points.h,
            displayId: displayId ?? 0,
            originX: display.points.x,
            originY: display.points.y,
            scaleFactor: display.scaleFactor,
          }
          traceCoords(
            `screenshot ${result.width}x${result.height} display#${display.index} ` +
            `points=(${display.points.x},${display.points.y},${display.points.w},${display.points.h}) ` +
            `pixels=${display.pixels.w}x${display.pixels.h} sf=${display.scaleFactor}`,
          )
          ctx.onScreenshotCaptured(storedDims)

          return {
            content: [{ type: 'image', mimeType: 'image/jpeg', data: result.base64 }],
            telemetry: {},
          }
        }

        // ── left_click ────────────────────────────────────────────────────
        case 'left_click': {
          const { x, y } = toPoints(a.x, a.y, displayId)
          await executor.click(x, y, 'left', 1, a.modifiers ?? [])
          return ok(`Clicked at (${a.x}, ${a.y})`)
        }

        // ── right_click ───────────────────────────────────────────────────
        case 'right_click': {
          const { x, y } = toPoints(a.x, a.y, displayId)
          await executor.click(x, y, 'right', 1)
          return ok(`Right-clicked at (${a.x}, ${a.y})`)
        }

        // ── middle_click ──────────────────────────────────────────────────
        case 'middle_click': {
          const { x, y } = toPoints(a.x, a.y, displayId)
          await executor.click(x, y, 'middle', 1)
          return ok(`Middle-clicked at (${a.x}, ${a.y})`)
        }

        // ── double_click ──────────────────────────────────────────────────
        case 'double_click': {
          const { x, y } = toPoints(a.x, a.y, displayId)
          await executor.click(x, y, 'left', 2)
          return ok(`Double-clicked at (${a.x}, ${a.y})`)
        }

        // ── left_click_drag ───────────────────────────────────────────────
        case 'left_click_drag': {
          const [ex, ey] = a.coordinate
          const end = toPoints(ex, ey, displayId)
          let start
          if (Array.isArray(a.start_coordinate)) {
            const [sx, sy] = a.start_coordinate
            start = toPoints(sx, sy, displayId)
          }
          await executor.drag(start, end)
          return ok(`Dragged to (${ex}, ${ey})`)
        }

        // ── type ──────────────────────────────────────────────────────────
        case 'type': {
          const text = String(a.text ?? '')
          if (!text) return ok('No text to type')

          // Use clipboard paste for multiline or non-ASCII text (CJK etc.)
          // enigo's typeText uses CGEventCreateKeyboardEvent which cannot produce
          // non-ASCII characters — they come out as garbage. Always use clipboard
          // for any text containing characters outside the Basic Latin range.
          const subGates = adapter.getSubGates?.() ?? {}
          const hasNonAscii = /[^\x00-\x7F]/.test(text)
          const useClipboard =
            subGates.clipboardPasteMultiline !== false && (text.includes('\n') || hasNonAscii)

          if (useClipboard) {
            await executor.type(text, { viaClipboard: true })
          } else {
            // Per-grapheme with 8ms inter-key delay
            const graphemes = [...new Intl.Segmenter().segment(text)].map(s => s.segment)
            for (let i = 0; i < graphemes.length; i++) {
              await executor.type(graphemes[i], { viaClipboard: false })
              if (i < graphemes.length - 1) {
                await new Promise(r => setTimeout(r, 8))
              }
            }
          }
          return ok(`Typed ${text.length} character(s)`)
        }

        // ── key ───────────────────────────────────────────────────────────
        case 'key': {
          await executor.key(String(a.text ?? ''), a.repeat)
          return ok(`Pressed key: ${a.text}`)
        }

        // ── hold_key ──────────────────────────────────────────────────────
        case 'hold_key': {
          const keyNames = a.key ? [String(a.key)] : []
          await executor.holdKey(keyNames, a.duration_ms ?? 1000)
          return ok(`Held key(s): ${keyNames.join('+')}`)
        }

        // ── mouse_move ────────────────────────────────────────────────────
        case 'mouse_move': {
          const { x, y } = toPoints(a.x, a.y, displayId)
          await executor.moveMouse(x, y)
          return ok(`Moved mouse to (${a.x}, ${a.y})`)
        }

        // ── scroll ────────────────────────────────────────────────────────
        case 'scroll': {
          const { x, y } = toPoints(a.x, a.y, displayId)
          await executor.scroll(x, y, a.horizontal_distance ?? 0, a.vertical_distance ?? 0)
          return ok(`Scrolled at (${a.x}, ${a.y})`)
        }

        // ── cursor_position ───────────────────────────────────────────────
        case 'cursor_position': {
          // executor reports GLOBAL POINTS; convert back into the same
          // screenshot space the model addresses, so a value returned here can
          // be handed straight back to left_click / mouse_move.
          const pt = await executor.getCursorPosition()
          const display = geometry.displayContainingPoint(pt.x, pt.y)
            ?? geometry.getDisplay(displayId)
          const shot = currentShot(display.index)
          const s = geometry.pointsToScreenshot(pt.x, pt.y, shot, display)
          traceCoords(
            `cursor_position points=(${pt.x.toFixed(1)},${pt.y.toFixed(1)}) ` +
            `display#${display.index} => screenshot=(${s.x.toFixed(1)},${s.y.toFixed(1)})`,
          )
          return ok(JSON.stringify({
            x: Math.round(s.x),
            y: Math.round(s.y),
            display: display.index,
          }))
        }

        // ── zoom ──────────────────────────────────────────────────────────
        case 'zoom': {
          const [cx, cy] = a.coordinate
          const display = geometry.getDisplay(displayId)
          const shot = currentShot(displayId)
          // Region is sized in screenshot units and converted to POINTS, which
          // is what `screencapture -R` expects. Passing pixels here previously
          // produced rects outside the display bounds on Retina screens.
          const region = geometry.zoomRegionPoints(cx, cy, shot, display, ZOOM_BOX_SHOT_PX)
          traceCoords(
            `zoom center=(${cx},${cy}) => region points=` +
            `(${region.x.toFixed(1)},${region.y.toFixed(1)},${region.w.toFixed(1)},${region.h.toFixed(1)})`,
          )
          const result = await executor.zoom(region, getAllowedBundleIds(), displayId)
          return {
            content: [{ type: 'image', mimeType: 'image/jpeg', data: result.base64 }],
            telemetry: {},
          }
        }

        // ── request_access ────────────────────────────────────────────────
        case 'request_access': {
          const requestedApps = a.apps ?? []
          const req = { apps: requestedApps, flags: a.flags ?? DEFAULT_GRANT_FLAGS }
          const resp = await ctx.onPermissionRequest(req, null)
          ctx.onAllowedAppsChanged(resp.granted, resp.flags)
          const names = resp.granted.map(a => a.displayName || a.bundleId).join(', ')
          return ok(
            resp.granted.length > 0
              ? `Access granted for: ${names}`
              : 'No apps selected for access',
          )
        }

        // ── switch_display ────────────────────────────────────────────────
        case 'switch_display': {
          if (a.display === 'auto' || a.display == null) {
            ctx.onDisplayPinned(undefined)
          } else {
            const idx = typeof a.display === 'number' ? a.display : parseInt(a.display) || 0
            ctx.onDisplayPinned(idx)
          }
          return ok(`Switched to display: ${a.display}`)
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
            telemetry: { error_kind: 'unknown_tool' },
          }
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error in ${toolName}: ${err?.message ?? String(err)}` }],
        telemetry: { error_kind: 'execution_error' },
      }
    }
  }
}
