# Agent Cowork 项目文档

## 项目概述

Agent Cowork 是一个开源的桌面 AI 助手应用，是 Claude Cowork 的替代方案。它帮助用户完成编程、文件管理以及任何可以用自然语言描述的任务。

### 核心特性

- 🖥️ **原生桌面应用**：基于 Electron 构建，提供流畅的桌面体验
- 🤖 **AI 协作伙伴**：与 Claude Code 完全兼容，复用现有配置
- 📂 **会话管理**：支持多会话、会话历史记录、状态持久化
- 🎯 **实时流式输出**：逐字显示 AI 响应，支持 Markdown 和代码高亮
- 🔐 **权限控制**：交互式工具权限管理，完全控制 AI 能执行的操作

### 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 39 |
| 前端 | React 19, Tailwind CSS 4 |
| 状态管理 | Zustand |
| 数据库 | better-sqlite3 (WAL 模式) |
| AI SDK | @anthropic-ai/claude-agent-sdk |
| 构建工具 | Vite, electron-builder |
| 语言 | TypeScript |

## 项目结构

```
Claude-Cowork/
├── src/
│   ├── electron/              # Electron 主进程
│   │   ├── main.ts           # 应用入口
│   │   ├── ipc-handlers.ts   # IPC 事件处理
│   │   ├── pathResolver.ts   # 路径解析
│   │   ├── preload.cts       # 预加载脚本
│   │   ├── types.ts          # 类型定义
│   │   ├── util.ts           # 工具函数
│   │   └── libs/             # 核心库
│   │       ├── claude-settings.ts  # Claude 配置管理
│   │       ├── config-store.ts     # 配置存储
│   │       ├── runner.ts           # Claude 运行器
│   │       ├── session-store.ts    # 会话存储
│   │       └── util.ts             # 工具函数
│   └── ui/                    # React 前端
│       ├── App.tsx           # 主应用组件
│       ├── main.tsx          # 前端入口
│       ├── components/       # UI 组件
│       │   ├── Sidebar.tsx
│       │   ├── StartSessionModal.tsx
│       │   ├── SettingsModal.tsx
│       │   ├── PromptInput.tsx
│       │   ├── EventCard.tsx
│       │   └── DecisionPanel.tsx
│       ├── hooks/            # React Hooks
│       │   ├── useIPC.ts
│       │   └── useMessageWindow.ts
│       ├── store/            # Zustand 状态管理
│       │   └── useAppStore.ts
│       └── render/           # 渲染组件
│           └── markdown.tsx
├── package.json
├── vite.config.ts
├── tsconfig.json
└── electron-builder.json
```

## 构建和运行

### 前置要求

- [Bun](https://bun.sh/) 或 Node.js 22+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 已安装并完成认证

### 开发命令

```bash
# 安装依赖
bun install

# 启动开发服务器（热重载）
bun run dev

# 类型检查和构建
bun run build

# 代码检查
bun run lint
```

### 构建生产版本

```bash
# macOS Apple Silicon (M1/M2/M3)
bun run dist:mac-arm64

# macOS Intel
bun run dist:mac-x64

# Windows
bun run dist:win

# Linux
bun run dist:linux
```

### 重新构建原生模块

```bash
bun run rebuild
```

## 开发约定

### 代码风格

- 使用 TypeScript 进行严格类型检查
- 遵循 ESLint 配置中的代码规范
- 使用 React Hooks 进行状态管理
- 组件采用函数式组件

### 状态管理

- 使用 Zustand 进行全局状态管理
- 状态存储在 `src/ui/store/useAppStore.ts`
- 通过 IPC 在 Electron 主进程和渲染进程之间传递事件

### 事件通信

- **客户端 → 服务端**（渲染进程 → 主进程）：`ClientEvent`
  - `session.start` - 启动新会话
  - `session.continue` - 继续现有会话
  - `session.stop` - 停止会话
  - `session.delete` - 删除会话
  - `session.list` - 获取会话列表
  - `session.history` - 获取会话历史
  - `permission.response` - 响应权限请求

- **服务端 → 客户端**（主进程 → 渲染进程）：`ServerEvent`
  - `stream.message` - 流式消息
  - `stream.user_prompt` - 用户提示
  - `session.status` - 会话状态更新
  - `session.list` - 会话列表
  - `session.history` - 会话历史
  - `session.deleted` - 会话删除通知
  - `permission.request` - 权限请求
  - `runner.error` - 运行器错误

### 数据库

- 使用 `better-sqlite3` 存储会话数据
- 数据库文件位置：`~/Library/Application Support/agent-cowork/sessions.db` (macOS)
- 使用 WAL 模式提高并发性能

### 配置管理

- 复用 Claude Code 的配置文件：`~/.claude/settings.json`
- 配置通过 `src/electron/libs/claude-settings.ts` 管理
- 支持自定义 API 密钥、Base URL 和模型配置

## 核心模块说明

### Electron 主进程

**main.ts** (`src/electron/main.ts`)
- 应用入口点
- 创建主窗口
- 设置 IPC 处理器
- 管理全局快捷键和清理逻辑

**ipc-handlers.ts** (`src/electron/ipc-handlers.ts`)
- 处理所有来自渲染进程的 IPC 事件
- 管理会话生命周期
- 广播服务端事件到所有窗口

**runner.ts** (`src/electron/libs/runner.ts`)
- 封装 Claude Agent SDK
- 执行 AI 查询
- 处理工具权限请求
- 流式输出消息

**session-store.ts** (`src/electron/libs/session-store.ts`)
- SQLite 数据库封装
- 会话 CRUD 操作
- 消息历史记录

### React 前端

**App.tsx** (`src/ui/App.tsx`)
- 主应用组件
- 管理消息滚动和加载
- 处理权限请求
- 集成所有子组件

**useAppStore.ts** (`src/ui/store/useAppStore.ts`)
- 全局状态管理
- 会话状态
- 消息列表
- 权限请求

**useIPC.ts** (`src/ui/hooks/useIPC.ts`)
- IPC 通信封装
- 事件发送和接收
- 连接状态管理

### UI 组件

- **Sidebar** - 侧边栏，显示会话列表
- **StartSessionModal** - 启动新会话的模态框
- **SettingsModal** - 设置模态框
- **PromptInput** - 输入框组件
- **EventCard** - 消息卡片组件
- **DecisionPanel** - 权限决策面板

## 开发注意事项

1. **原生模块**：`better-sqlite3` 是原生模块，需要重新构建
2. **环境变量**：开发时通过 Vite 加载环境变量
3. **热重载**：开发模式下支持前端和 Electron 的热重载
4. **端口管理**：开发服务器使用固定端口（通过环境变量配置）
5. **清理逻辑**：应用退出时需要清理所有会话和资源

## 与 Claude Code 的兼容性

Agent Cowork 与 Claude Code 共享相同的配置文件（`~/.claude/settings.json`），这意味着：

- 相同的 API 密钥
- 相同的 Base URL
- 相同的模型配置
- 相同的行为和工具集

配置一次 Claude Code，即可在 Agent Cowork 中使用。

## 常见问题

### 如何配置 API？

1. 打开设置模态框
2. 输入 API 密钥、Base URL 和模型名称
3. 保存配置
4. 配置会自动保存到 `~/.claude/settings.json`

### 如何调试？

- 开发模式下，主窗口会自动打开开发者工具
- 查看 Console 日志了解事件流
- 使用 Network 标签查看 IPC 通信

### 如何添加新工具？

1. 在 `src/electron/libs/runner.ts` 的 `canUseTool` 函数中添加工具逻辑
2. 如果需要用户确认，使用 `AskUserQuestion` 工具
3. 在前端添加相应的权限请求处理

## 许可证

MIT

## 贡献

欢迎提交 Pull Request。请确保：
- 代码通过类型检查（`bun run build`）
- 代码通过 lint 检查（`bun run lint`）
- 遵循现有的代码风格和约定