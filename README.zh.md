# computer-use-mac-mcp

[English](./README.md) | 中文文档

> 让 Claude（或任何 MCP 客户端）看到并控制你的 Mac — 截图、点击、输入、滚动，一应俱全。

基于标准 MCP 协议实现，可接入 Claude Desktop、Claude Code、Cursor 等任意 MCP 客户端，**工具层不依赖任何 AI 服务商的 API Key**。

纯 JS 实现，无需编译 native addon，底层使用 `screencapture`、`osascript`（JXA/AppKit）、CoreGraphics CGEvent。

## 亮点

- **标准 MCP 接口** — 不绑定特定 AI 厂商，任何支持 MCP 的客户端都能接入
- **Retina 坐标正确** — 自动换算截图坐标到物理像素（支持 2× Retina 缩放）
- **中文/日文/韩文输入** — 非 ASCII 文字自动走剪贴板粘贴，彻底解决乱码问题
- **多显示器支持** — `switch_display` 工具可切换到任意外接屏幕
- **无需编译** — 纯 JS，Node.js ≥ 18 或 Bun ≥ 1.3 直接运行

## 环境要求

- macOS
- Node.js ≥ 18 或 Bun ≥ 1.3
- **屏幕录制**权限 — 系统设置 → 隐私与安全性 → 屏幕录制
- **辅助功能**权限 — 系统设置 → 隐私与安全性 → 辅助功能

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/somethingforheheda/computer-use-mac-mcp.git
cd computer-use-mac-mcp

# 2. 安装依赖
npm install
```

### Claude Desktop 配置

编辑 `~/Library/Application Support/Claude/claude_desktop_config.json`：

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

### Claude Code / 其他 MCP 客户端

```json
{
  "computer-use": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/computer-use-mac-mcp/index.js"]
  }
}
```

## 工具列表（15 个）

| 工具 | 说明 |
|------|------|
| `screenshot` | 截取屏幕，返回 JPEG base64 |
| `left_click` | 在 `(x, y)` 位置左键点击 |
| `right_click` | 右键点击 |
| `middle_click` | 中键点击 |
| `double_click` | 双击 |
| `left_click_drag` | 从一个位置拖拽到另一个位置 |
| `mouse_move` | 移动鼠标（不点击） |
| `scroll` | 在指定位置滚动 |
| `cursor_position` | 获取当前鼠标坐标 |
| `type` | 输入文字（中文等非 ASCII 自动走剪贴板）|
| `key` | 按键或组合键，如 `command+c`、`command+a` |
| `hold_key` | 长按某个按键指定时长 |
| `zoom` | 截取并放大屏幕某个区域 |
| `request_access` | 声明 Agent 需要控制哪些应用 |
| `switch_display` | 切换目标显示器（多屏场景）|

## 坐标系说明

坐标为**截图像素坐标**。每次操作前先调用 `screenshot`——服务端会缓存该次截图对应的显示器物理尺寸，后续点击坐标会自动换算到物理像素（含 Retina 2× 处理）。

## 多显示器

```
# 切换到外接显示器（0 = 主屏，1 = 第二屏，以此类推）
switch_display { "display": 1 }
```

切换后，`screenshot` 和所有点击工具均作用于选定的显示器。

## 实现原理

`packages/` 下三个子包：

| 包 | 职责 | 实现方式 |
|----|------|---------|
| `computer-use-mcp` | MCP Server、工具定义、坐标换算调度 | MCP SDK + `bindSessionContext` |
| `computer-use-swift` | 截图、应用列举、激活应用 | `screencapture` + `osascript`（JXA/AppKit） |
| `computer-use-input` | 鼠标移动/点击/滚动、键盘输入 | JXA + CoreGraphics `CGEventCreateMouseEvent` / `CGEventCreateKeyboardEvent` |

入口文件 `index.js` 将三个包组合起来，通过 stdio 对外暴露为标准 MCP Server，每次工具调用不会额外 spawn 子进程。

## 与同类项目对比

| | **本项目** | [PallavAg/claude-computer-use-macos](https://github.com/PallavAg/claude-computer-use-macos) |
|---|---|---|
| 语言 | JS（Node/Bun） | Python |
| 接入方式 | **MCP Server**（任意客户端） | 独立脚本（绑定 Claude API） |
| Retina 支持 | ✅ | ❌ |
| 中文输入 | ✅ 自动走剪贴板 | ❌ 乱码 |
| 多显示器 | ✅ `switch_display` | ❌ |
| 需要 API Key | ❌ | ✅ |
| Native 编译 | ❌ 纯 JS | ❌ 纯 Python |

## License

MIT
