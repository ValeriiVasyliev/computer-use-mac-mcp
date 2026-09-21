# computer-use-mac-mcp

> MCP server for macOS desktop automation — screenshot, click, type, scroll and more.

Gives Claude (or any MCP-compatible agent) the ability to see and control your Mac. Implements the standard `mcp__computer-use__*` tool interface so it works with Claude Desktop, Claude Code, Cursor, and any other MCP client — **no API key required at the tool level**.

**Pure JS, no native addons.** Uses `screencapture`, `osascript` (JXA/AppKit), and CoreGraphics CGEvent.

## Highlights

- **Standard MCP interface** — plug into any MCP-compatible client, not locked to a specific AI provider
- **Retina display aware** — correctly scales screenshot-space coordinates to physical pixels
- **CJK / Unicode text input** — automatically routes non-ASCII text through clipboard paste (fixes garbled Chinese/Japanese/Korean input)
- **Multi-monitor support** — `switch_display` tool lets agents target any connected display
- **No native compilation** — pure JS implementation, works with Node.js ≥ 18 or Bun ≥ 1.3

## Requirements

- macOS
- Node.js ≥ 18 or Bun ≥ 1.3
- **Screen Recording** permission — System Settings → Privacy & Security → Screen Recording
- **Accessibility** permission — System Settings → Privacy & Security → Accessibility

## Quick Start

```bash
# 1. Clone
git clone https://github.com/somethingforheheda/computer-use-mac-mcp.git
cd computer-use-mac-mcp

# 2. Install dependencies
npm install

# 3. Add to your MCP client config (see below)
```

### Claude Code CLI

`computer-use` is a reserved name in Claude Code CLI. Use a different name:

```bash
claude mcp add -s user mac-control /path/to/node /path/to/computer-use-mac-mcp/index.js
```

Tools will be available as `mcp__mac-control__screenshot`, `mcp__mac-control__left_click`, etc.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "computer-use": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/computer-use-mac-mcp/index.js"]
    }
  }
}
```

### Claude Code / jarvis-cc

```json
{
  "computer-use": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/computer-use-mac-mcp/index.js"]
  }
}
```

## Available Tools (15)

| Tool | Description |
|------|-------------|
| `screenshot` | Capture the screen as JPEG |
| `left_click` | Left-click at `(x, y)` |
| `right_click` | Right-click at `(x, y)` |
| `middle_click` | Middle-click at `(x, y)` |
| `double_click` | Double-click at `(x, y)` |
| `left_click_drag` | Click and drag from one point to another |
| `mouse_move` | Move cursor without clicking |
| `scroll` | Scroll at `(x, y)` |
| `cursor_position` | Get current cursor coordinates |
| `type` | Type text — auto clipboard for CJK/Unicode |
| `key` | Press a key or combo (e.g. `command+c`, `command+a`) |
| `hold_key` | Hold a key for a specified duration |
| `zoom` | Capture and zoom a screen region |
| `request_access` | Declare which apps the agent will control |
| `switch_display` | Switch active display for multi-monitor setups |

## Coordinate System

Every coordinate in the public API is in **screenshot space**: `(0, 0)` is the
top-left of the image returned by `screenshot`, and `(width, height)` is its
bottom-right. `cursor_position` reports in that same space, so a value it
returns can be passed straight back to `left_click` or `mouse_move`.

Internally there is exactly one conversion, in
`packages/computer-use-geometry`, from screenshot space to **global points** —
the coordinate space CoreGraphics mouse events and `screencapture -R` use:

```
globalX = display.origin.x + x * (display.widthInPoints  / screenshot.width)
globalY = display.origin.y + y * (display.heightInPoints / screenshot.height)
```

Note there is no `backingScaleFactor` term: the Retina scale factor is already
absorbed by the screenshot's own pixel dimensions. Nothing is hard-coded to 2×,
so Retina, non-Retina, and mixed-DPI multi-display arrangements all work, and
display origins (including negative ones, for screens placed left of or above
the primary) are honoured.

Screenshot size and pointer mapping are derived from the same display record, so
the two spaces cannot drift apart. Calling `screenshot` first is no longer
required for correct clicking — if no screenshot has been taken yet, the mapping
is derived from live display geometry.

Verify it on your own hardware:

```bash
npm run calibrate   # moves the cursor only; no clicks, no keystrokes
```

Set `CU_DEBUG_COORDS=1` to trace every conversion on stderr.

## Multi-monitor

```
# Switch to external display (0 = primary, 1 = secondary, ...)
switch_display { "display": 1 }
```

After switching, subsequent `screenshot` and click tools target the selected display.

## Security

This server can see your whole screen and can type and click anywhere in your
logged-in session. Synthetic events are indistinguishable from your own to the
apps receiving them, so treat granting it to an agent as you would handing over
the keyboard. Two controls are built in.

**Protected apps (on by default).** Clicks, keystrokes and screen captures are
refused while a password manager, credential prompt or authenticator app is
frontmost — a screenshot of an unlocked vault is a plaintext dump of it. The
list lives in `packages/computer-use-mcp/sentinelApps.js` and matches by
bundle-ID prefix. To turn this off:

```bash
CU_ALLOW_SENTINEL_APPS=1
```

**Restricting which apps can be driven (off by default).** `request_access` has
no human to ask in this server: by default it grants whatever the agent declares,
and the grant does not confine later input. Set an allowlist to make it binding:

```bash
CU_ALLOWED_APPS="com.apple.Safari,com.apple.Notes"
```

With it set, `request_access` grants only listed apps, and acting tools refuse
to fire unless the app that would receive the event is one of them — checked at
the moment of the click, since the frontmost app can change after the grant.

Two limits worth knowing:

- `screenshot` captures the whole display, so an allowlist does not keep
  non-allowed apps out of the image. Only the protected-app rule blocks capture.
- The allowlist is an operator control, read from the environment. The agent
  cannot widen it, but it is not a substitute for trusting the agent you connect.

## How it works

Three packages under `packages/`:

| Package | Responsibility | Implementation |
|---------|---------------|----------------|
| `computer-use-mcp` | MCP server, tool definitions, coordinate dispatch | MCP SDK + `bindSessionContext` |
| `computer-use-swift` | Screenshot, app listing, app activation | `screencapture` + `osascript` (JXA/AppKit) |
| `computer-use-input` | Mouse movement, clicks, scroll, keyboard | JXA + CoreGraphics `CGEventCreateMouseEvent` / `CGEventCreateKeyboardEvent` |

The entry point (`index.js`) wires these together and exposes them over stdio as an MCP server. No subprocess is spawned per tool call — everything runs in a single Node process.

## Comparison

| | **this project** | [PallavAg/claude-computer-use-macos](https://github.com/PallavAg/claude-computer-use-macos) |
|---|---|---|
| Language | JS (Node/Bun) | Python |
| Interface | **MCP Server** (any client) | Standalone script (Claude API only) |
| Retina support | ✅ | ❌ |
| CJK text input | ✅ auto clipboard | ❌ garbled output |
| Multi-monitor | ✅ `switch_display` | ❌ |
| Needs API key to run | ❌ | ✅ |
| Native addons | ❌ pure JS | ❌ pure Python |

## License

MIT
