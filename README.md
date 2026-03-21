
<div align="center">

# Open Claude Cowork

[![Version](https://img.shields.io/badge/version-0.0.2-blue.svg)](https://github.com/DevAgentForge/Claude-Cowork/releases)
[![Platform](https://img.shields.io/badge/platform-%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/DevAgentForge/Claude-Cowork/releases)

[简体中文](README_ZH.md)

</div>

## ❤️ Collaboration

[![MiniMax](assets/partners/minimax-en.png)](https://platform.minimax.io/subscribe/coding-plan?code=5q2B2ljfdw&source=link)

MiniMax M2.7 is a frontier LLM built for agentic execution, SOTA performance, and real-world productivity—it plans, codes, uses tools, and completes complex workflows end-to-end, then iteratively improves its own performance. It delivers state-of-the-art results on software engineering and agent benchmarks (e.g., ~56% SWE-Pro, strong performance across VIBE, Terminal Bench, and agent evaluations) while extending that same capability into office work—creating and editing high-quality Word, Excel, and PowerPoint outputs with deliverable-level accuracy . Designed for long-horizon tasks, M2.7 combines deep reasoning, tool orchestration, and reliable multi-step execution, pushing beyond static models toward systems that continuously optimize how they work across both technical and everyday productivity workflows.

[Click ](https://platform.minimax.io/subscribe/coding-plan?code=5q2B2ljfdw&source=link)  to get an exclusive 12% off the MiniMax Token Plan!



## Agent Cowork

Agent Cowork is an open-source alternative to Claude Cowork — a desktop AI assistant that helps with programming, file management, and any task you can describe.

> Not just a GUI.  
> A real AI collaboration partner.  
> No need to learn the Claude Agent SDK — just create tasks and choose execution paths.



## ✨ Why Agent Cowork?

Claude Code is powerful — but it **only runs in the terminal**.

That means:
- ❌ No visual feedback for complex tasks
- ❌ Hard to track multiple sessions
- ❌ Tool outputs are inconvenient to inspect

**Agent Cowork solves these problems:**

- 🖥️ Runs as a **native desktop application**
- 🤖 Acts as your **AI collaboration partner** for any task
- 🔁 Reuses your **existing `~/.claude/settings.json`**
- No development environment or Claude Code installation required.



## 🚀 Quick Start

### Option 1: Download a Release

👉 [Go to Releases](https://github.com/DevAgentForge/agent-cowork/releases)


### Option 2: Build from Source

#### Prerequisites

- [Bun](https://bun.sh/) or Node.js 22+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

bash
#### Clone the repository
git clone https://github.com/DevAgentForge/agent-cowork.git
cd agent-cowork

#### Install dependencies
bun install

#### Run in development mode
bun run dev

#### Or build production binaries

```bash
bun run dist:mac-arm64    # macOS Apple Silicon (M1/M2/M3)
bun run dist:mac-x64      # macOS Intel
bun run dist:win          # Windows
bun run dist:linux        # Linux
```

## Example
An example of organizing a local folder:

https://github.com/user-attachments/assets/8ce58c8b-4024-4c01-82ee-f8d8ed6d4bba


## 🛠 Development

bash
#### Start development server (hot reload)
bun run dev

#### Type checking / build
bun run build



## 🗺 Roadmap

Planned features:

todo



## 🤝 Contributing

Pull requests are welcome.

1. Fork this repository
2. Create your feature branch
3. Commit your changes
4. Open a Pull Request

Please make only minimal changes.



## ⭐ Final Words

If you’ve ever wanted:

* A persistent desktop AI collaboration partner
* Visual insight into how Claude works
* Convenient session management across projects

This project is built for you.

👉 **If it helps you, please give it a Star.**



## License

MIT



