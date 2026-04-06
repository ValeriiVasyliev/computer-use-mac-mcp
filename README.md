# computer-use-mac-mcp

MCP server for macOS desktop automation. Gives Claude (or any MCP-compatible agent) the ability to control your Mac via screenshot + mouse + keyboard.

Implemented with pure JS — no native addons. Uses `screencapture`, `osascript` (JXA/AppKit), and CoreGraphics CGEvent.

## Requirements

- macOS
- Node.js ≥ 18 or Bun ≥ 1.3
- **Screen Recording** permission (System Settings → Privacy & Security)
- **Accessibility** permission (System Settings → Privacy & Security)

## Usage

### Install dependencies

```bash
npm install
# or
bun install
```

### Add to MCP config

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

Claude Desktop config location: `~/Library/Application Support/Claude/claude_desktop_config.json`

## Available Tools (15)

| Tool | Description |
|------|-------------|
| `screenshot` | Capture the screen |
| `left_click` | Left click at coordinates |
| `right_click` | Right click at coordinates |
| `middle_click` | Middle click at coordinates |
| `double_click` | Double click at coordinates |
| `left_click_drag` | Click and drag |
| `mouse_move` | Move cursor without clicking |
| `scroll` | Scroll at coordinates |
| `cursor_position` | Get current cursor position |
| `type` | Type text (auto clipboard for CJK/Unicode) |
| `key` | Press key or key combo (e.g. `command+c`) |
| `hold_key` | Hold a key for a duration |
| `zoom` | Capture and zoom a screen region |
| `request_access` | Grant access to specific apps (auto-approved) |
| `switch_display` | Switch active display (for multi-monitor) |

## Coordinate System

Coordinates are in **screenshot-space pixels**. Always call `screenshot` first — the server caches the display dimensions from each screenshot to correctly scale click coordinates to physical pixels.

## Multi-monitor

Use `switch_display` with `display: 1` (0-indexed) to switch to an external monitor.

## Implementation

Three packages in `packages/`:

| Package | Role |
|---------|------|
| `computer-use-mcp` | MCP server, tool definitions, coordinate dispatch |
| `computer-use-swift` | Screenshot + app management via `screencapture` + osascript |
| `computer-use-input` | Mouse + keyboard via JXA + CoreGraphics CGEvent |

## License

MIT
