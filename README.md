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

Coordinates are in **screenshot-space pixels**. Always call `screenshot` first — the server caches the display dimensions and uses them to correctly map click coordinates to physical pixels (including Retina 2× scaling).

## Multi-monitor

```
# Switch to external display (0 = primary, 1 = secondary, ...)
switch_display { "display": 1 }
```

After switching, subsequent `screenshot` and click tools target the selected display.

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
