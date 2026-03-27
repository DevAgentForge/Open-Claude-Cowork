<div align="center">

# Open Claude Cowork

[![Version](https://img.shields.io/badge/version-0.0.2-blue.svg)](https://github.com/DevAgentForge/Claude-Cowork/releases)
[![Platform](https://img.shields.io/badge/platform-%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/DevAgentForge/Claude-Cowork/releases)

[English](README.md) | [简体中文](README_ZH.md)

</div>

## ❤️ 合作

[![MiniMax](assets/partners/minimax_banner.jpg)](https://platform.minimaxi.com/subscribe/coding-plan?code=6uFnRx7O0W&source=link)

MiniMax-M2.1 是一款開源的 SOTA（當前最先進）模型，在程式設計能力、數位環境操作以及處理長流程、多步驟任務方面表現出色。
透過 開源的 Claude Cowork 替代方案，M2.1 朝著我們「通用生產力 AI」的長期願景邁出了堅實一步，讓先進的 AI 能力真正觸及每一個人。

[點擊](https://platform.minimaxi.com/subscribe/coding-plan?code=6uFnRx7O0W&source=link)即可享受 MiniMax 程式設計計畫專屬 12% 折扣


## 關於

一個**桌面 AI 助手**，幫助你完成**程式設計、檔案管理以及任何你能描述的任務**，  

強行相容**Claude Code 完全相同的配置**，這意味著你可以使用任意相容 Anthropic 的大型模型來執行。

> 不只是一個 GUI。  
> 是真正的 AI 協作夥伴。  
> 無需學習 Claude Agent SDK，使用該軟體建立任務並選擇任務路徑即可。

一個整理本地資料夾的例子：

[https://github.com/user-attachments/assets/694430fb-9d4b-452e-8429-d9c565082f43](https://github.com/user-attachments/assets/8ce58c8b-4024-4c01-82ee-f8d8ed6d4bba)


## 入群交流
![24](https://github.com/user-attachments/assets/c75070a0-2d22-4515-aaff-3909ab8f234d)


## 🚀 快速開始


### 方式一：下載安裝套件


👉 [前往 Releases 下載](https://github.com/DevAgentForge/agent-cowork/releases)


### 方式二：從原始碼建構

#### 前置要求

- [Bun](https://bun.sh/) 或 Node.js 18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 已安裝並完成認證

```bash
# 複製倉儲
git clone https://github.com/DevAgentForge/agent-cowork.git
cd agent-cowork

# 安裝依賴
bun install

# 開發模式執行
bun run dev

# 或建構生產版本
bun run dist:mac-arm64    # macOS Apple Silicon (M1/M2/M3)
bun run dist:mac-x64      # macOS Intel
bun run dist:win          # Windows
bun run dist:linux        # Linux
```

## 🧠 核心能力

### 🤖 AI 協作夥伴 — 不只是 GUI

Agent Cowork 是你的 AI 協作夥伴，可以：

* **編寫和編輯程式碼** — 支援任何程式設計語言
* **管理檔案** — 建立、移動、整理
* **執行指令** — 建構、測試、部署
* **回答問題** — 關於你的程式碼庫
* **做任何事** — 只要你能用自然語言描述


### 📂 會話管理

* 建立會話並指定**自訂工作目錄**
* 恢復任何之前的對話
* 完整的本機會話歷史（SQLite 儲存）
* 安全刪除和自動持久化

### 🎯 即時串流輸出

* **逐字串流輸出**
* 查看 Claude 的思考過程
* Markdown + 語法高亮程式碼渲染
* 工具呼叫視覺化及狀態指示


### 🔐 工具權限控制

* 敏感操作需要明確批准
* 按工具允許/拒絕
* 互動式決策面板
* 完全控制 Claude 能做什麼


## 🔁 與 Claude Code 完全相容

Agent Cowork **與 Claude Code 共享配置**。

直接複用：

```text
~/.claude/settings.json
```

這意味著：

* 相同的 API 金鑰
* 相同的 Base URL
* 相同的模型
* 相同的行為

> 配置一次 Claude Code — 到處使用。


## 🧩 架構概覽

| 層級 | 技術 |
|------|------|
| 框架 | Electron 39 |
| 前端 | React 19, Tailwind CSS 4 |
| 狀態管理 | Zustand |
| 資料庫 | better-sqlite3 (WAL 模式) |
| AI | @anthropic-ai/claude-agent-sdk |
| 建構 | Vite, electron-builder |


## 🛠 開發

```bash
# 啟動開發伺服器（熱重載）
bun run dev

# 型別檢查
bun run build

# 程式碼檢查
bun run lint
```

## 🗺 路線圖

計畫中的功能：

* GUI 配置介面與 KEY
* 🚧 更多功能即將推出


## ⭐ 最後

如果你曾經想要：

* 一個常駐桌面的 AI 協作夥伴
* Claude 工作過程的視覺化回饋
* 跨專案的便捷會話管理

這個專案就是為你準備的。

👉 **如果對你有幫助，請給個 Star。**


## 授權條款

MIT