#!/usr/bin/env node
/**
 * computer-use-mac-mcp — standalone MCP server for macOS desktop automation.
 *
 * Implements the same 15 tools as Anthropic's computer-use via pure JS:
 *   screenshot, left_click, right_click, middle_click, double_click,
 *   left_click_drag, type, key, hold_key, mouse_move, scroll,
 *   cursor_position, zoom, request_access, switch_display
 *
 * Usage (stdio MCP):
 *   node index.js
 *
 * MCP config example:
 *   {
 *     "computer-use": {
 *       "type": "stdio",
 *       "command": "node",
 *       "args": ["/path/to/computer-use-mac-mcp/index.js"]
 *     }
 *   }
 *
 * Requires macOS with Screen Recording + Accessibility permissions granted.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'

import {
  API_RESIZE_PARAMS,
  bindSessionContext,
  buildComputerUseTools,
  createSubprocessCtx,
  targetImageSize,
} from './packages/computer-use-mcp/index.js'
import * as cuInput from './packages/computer-use-input/index.js'
import * as cuSwift from './packages/computer-use-swift/index.js'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const execFileAsync = promisify(execFile)

// ── Clipboard helpers ──────────────────────────────────────────────────────

async function readClipboard() {
  const { stdout } = await execFileAsync('pbpaste', [])
  return stdout
}

async function writeClipboard(text) {
  await new Promise((resolve, reject) => {
    const proc = execFile('pbcopy', [], (err) => (err ? reject(err) : resolve()))
    proc.stdin.end(text)
  })
}

// ── Executor ───────────────────────────────────────────────────────────────

const MOVE_SETTLE_MS = 50

async function moveAndSettle(x, y) {
  await cuInput.moveMouse(x, y, false)
  await new Promise(r => setTimeout(r, MOVE_SETTLE_MS))
}

async function typeViaClipboard(text) {
  let saved
  try { saved = await readClipboard() } catch { /* ignore */ }
  try {
    await writeClipboard(text)
    if ((await readClipboard()) !== text) throw new Error('Clipboard write did not round-trip.')
    await cuInput.keys(['command', 'v'])
    await new Promise(r => setTimeout(r, 100))
  } finally {
    if (typeof saved === 'string') {
      try { await writeClipboard(saved) } catch { /* ignore */ }
    }
  }
}

function computeTargetDims(logicalW, logicalH, scaleFactor) {
  const physW = Math.round(logicalW * scaleFactor)
  const physH = Math.round(logicalH * scaleFactor)
  return targetImageSize(physW, physH, API_RESIZE_PARAMS)
}

function createExecutor() {
  return {
    capabilities: {
      os: 'darwin',
      screenshot: true,
      leftClick: true, rightClick: true, middleClick: true, doubleClick: true,
      drag: true, type: true, key: true, holdKey: true, scroll: true,
      zoom: true, moveMouse: true, getCursorPosition: true,
      clipboard: true, listInstalledApps: true, listRunningApps: true,
      openApp: true, hostBundleId: 'com.computer-use-mac-mcp.host',
    },

    async getDisplaySize(displayId) {
      return cuSwift.display.getSize(displayId)
    },

    async screenshot({ allowedBundleIds, displayId }) {
      const d = cuSwift.display.getSize(displayId)
      const [tw, th] = computeTargetDims(d.width, d.height, d.scaleFactor)
      return cuSwift.screenshot.captureExcluding(allowedBundleIds, 0.75, tw, th, displayId)
    },

    async zoom(region, allowedBundleIds, displayId) {
      const d = cuSwift.display.getSize(displayId)
      const [outW, outH] = computeTargetDims(region.w, region.h, d.scaleFactor)
      return cuSwift.screenshot.captureRegion(
        allowedBundleIds, region.x, region.y, region.w, region.h, outW, outH, 0.75, displayId,
      )
    },

    async click(x, y, button, count, modifiers) {
      await moveAndSettle(x, y)
      if (modifiers && modifiers.length > 0) {
        const pressed = []
        try {
          for (const m of modifiers) { await cuInput.key(m, 'press'); pressed.push(m) }
          await cuInput.mouseButton(button, 'click', count)
        } finally {
          for (const m of [...pressed].reverse()) { await cuInput.key(m, 'release').catch(() => {}) }
        }
      } else {
        await cuInput.mouseButton(button, 'click', count)
      }
    },

    async moveMouse(x, y) {
      await moveAndSettle(x, y)
    },

    async drag(from, to) {
      if (from) await moveAndSettle(from.x, from.y)
      await cuInput.mouseButton('left', 'press')
      await new Promise(r => setTimeout(r, MOVE_SETTLE_MS))
      try { await moveAndSettle(to.x, to.y) }
      finally { await cuInput.mouseButton('left', 'release') }
    },

    async scroll(x, y, dx, dy) {
      await moveAndSettle(x, y)
      if (dy !== 0) await cuInput.mouseScroll(dy, 'vertical')
      if (dx !== 0) await cuInput.mouseScroll(dx, 'horizontal')
    },

    async key(sequence, repeat = 1) {
      const parts = sequence.split('+').filter(p => p.length > 0)
      for (let i = 0; i < repeat; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 8))
        await cuInput.keys(parts)
      }
    },

    async holdKey(keyNames, durationMs) {
      const pressed = []
      try {
        for (const k of keyNames) { await cuInput.key(k, 'press'); pressed.push(k) }
        await new Promise(r => setTimeout(r, durationMs))
      } finally {
        for (const k of [...pressed].reverse()) { await cuInput.key(k, 'release').catch(() => {}) }
      }
    },

    async type(text, { viaClipboard }) {
      if (viaClipboard) {
        await typeViaClipboard(text)
      } else {
        await cuInput.typeText(text)
      }
    },

    async getCursorPosition() {
      return cuInput.mouseLocation()
    },

    async getFrontmostApp() {
      const info = cuInput.getFrontmostAppInfo()
      if (!info || !info.bundleId) return null
      return { bundleId: info.bundleId, displayName: info.appName }
    },

    async listInstalledApps() {
      return cuSwift.apps.listInstalled()
    },

    async listRunningApps() {
      return cuSwift.apps.listRunning()
    },

    async openApp(bundleId) {
      await cuSwift.apps.open(bundleId)
    },

    async prepareForAction(_allowlist, _displayId) {
      return []
    },

    readClipboard,
    writeClipboard,
  }
}

// ── MCP Server ─────────────────────────────────────────────────────────────

async function main() {
  const executor = createExecutor()
  const adapter = {
    executor,
    isDisabled: () => false,
    getSubGates: () => ({
      pixelValidation: false,
      clipboardPasteMultiline: true,
      mouseAnimation: false,
      hideBeforeAction: false,
      autoTargetDisplay: false,
      clipboardGuard: false,
    }),
  }
  const coordinateMode = 'pixels'

  const server = new Server(
    { name: 'computer-use', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  // ListTools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildComputerUseTools(executor.capabilities, coordinateMode),
  }))

  // CallTool — real dispatch via bindSessionContext + createSubprocessCtx
  const ctx = createSubprocessCtx()
  const dispatch = bindSessionContext(adapter, coordinateMode, ctx)
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const { telemetry: _telemetry, ...result } = await dispatch(name, args)
    return result
  })

  const transport = new StdioServerTransport()
  let exiting = false
  const exit = () => { if (!exiting) { exiting = true; process.exit(0) } }
  process.stdin.on('end', exit)
  process.stdin.on('error', exit)

  await server.connect(transport)
}

main().catch(err => {
  process.stderr.write(`[computer-use-mac-mcp] Fatal: ${err.message}\n${err.stack}\n`)
  process.exit(1)
})
