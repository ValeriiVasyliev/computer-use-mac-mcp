# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.2.0] - 2026-09-21

### Added

- `packages/computer-use-geometry` — single source of display geometry and the
  one screenshot-space → global-points conversion. Display origins (including
  negative ones, for screens placed left of or above the primary) and mixed-DPI
  arrangements are honoured; nothing is hard-coded to 2×.
- `lib/freshness.js` — settles after input before capturing, and retries once
  when a frame hashes identically to the previous one, so a screenshot no longer
  returns a window-server frame that predates the input just posted.
- `npm test` — 20 tests over coordinate math and screenshot freshness
  (`test/coords.test.mjs`, `test/freshness.test.mjs`).
- `npm run calibrate` — verifies the coordinate mapping on your own hardware.
  Moves the cursor only; no clicks, no keystrokes.
- `CU_DEBUG_COORDS=1` environment variable to trace coordinate conversions on
  stderr.
- README section documenting the coordinate system and its conversion formula.

### Changed

- `cursor_position` now reports in screenshot space, so a returned value can be
  handed straight to `left_click` or `mouse_move`.
- `computer-use-input` speaks global points only; its scale-factor cache and the
  divide-by-`scaleFactor` in `moveMouse`/`mouseLocation` are gone.
- Calling `screenshot` first is no longer required for correct clicking — with no
  screenshot taken yet, the mapping is derived from live display geometry
  instead of passing coordinates through unconverted.
- Coordinate tracing is behind `CU_DEBUG_COORDS=1` rather than always-on stderr.

### Fixed

- Clicks landing off-target on Retina and multi-display setups: screenshot
  sizing and pointer mapping each queried the window server independently and
  guessed at Retina scaling, so the two spaces could drift apart.
- `zoom` regions falling outside the display bounds on Retina — the region is
  now sized in screenshot units and converted to points, which is what
  `screencapture -R` expects.

## [0.1.0] - 2026-04-07

Initial release: a standalone macOS computer-use MCP server. Pure JS, no native
addons — `screencapture`, `osascript` (JXA/AppKit) and CoreGraphics CGEvent.

### Added

- MCP stdio server exposing 15 tools: `screenshot`, `left_click`, `right_click`,
  `middle_click`, `double_click`, `left_click_drag`, `mouse_move`, `scroll`,
  `cursor_position`, `type`, `key`, `hold_key`, `zoom`, `request_access` and
  `switch_display`.
- `packages/computer-use-mcp` — MCP server, tool definitions and coordinate
  dispatch.
- `packages/computer-use-swift` — screenshot, app listing and app activation via
  `screencapture` and `osascript`.
- `packages/computer-use-input` — mouse movement, clicks, scroll and keyboard via
  JXA and CoreGraphics `CGEventCreateMouseEvent` / `CGEventCreateKeyboardEvent`.
- CJK / Unicode text input routed through clipboard paste, fixing garbled
  Chinese/Japanese/Korean output from `type`.
- Multi-monitor support through `switch_display`.

### Fixed

- External display capture, via the `screencapture -D` flag.

### Documentation

- Noted that `computer-use` is a reserved server name in the Claude Code CLI, so
  a different name must be used when registering the server there.

[Unreleased]: https://github.com/ValeriiVasyliev/computer-use-mac-mcp/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ValeriiVasyliev/computer-use-mac-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ValeriiVasyliev/computer-use-mac-mcp/releases/tag/v0.1.0
