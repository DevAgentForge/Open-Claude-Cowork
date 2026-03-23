import { useState, ReactNode } from "react";
import { APIConfigPanel } from "./APIConfigPanel";
import { MCPToolsPanel } from "./MCPToolsPanel";
import { AgentsPanel } from "./AgentsPanel";

/** Tab 类型定义 */
type SettingsTab = "api" | "mcp" | "agents";

interface SettingsModalProps {
  onClose: () => void;
}

/** Tab 配置 */
const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  {
    id: "api",
    label: "API 配置",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6a5 5 0 1 1 0-10h3" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  {
    id: "mcp",
    label: "MCP 工具",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    id: "agents",
    label: "AI 助手",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("api");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-ink-900/5 bg-surface shadow-elevated flex flex-col max-h-[90vh]">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-ink-900/5">
          <div className="text-base font-semibold text-ink-800">设置</div>
          <button
            className="rounded-full p-1.5 text-muted hover:bg-surface-tertiary hover:text-ink-700 transition-colors"
            onClick={onClose}
            aria-label="关闭"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab 导航 */}
        <div className="flex px-6 pt-4 gap-1 border-b border-ink-900/5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`
                flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all
                ${activeTab === tab.id
                  ? "text-accent bg-accent/5 border-b-2 border-accent -mb-px"
                  : "text-muted hover:text-ink-700 hover:bg-surface-tertiary"
                }
              `}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeTab === "api" && <APIConfigPanel onSuccess={onClose} />}
          {activeTab === "mcp" && <MCPToolsPanel />}
          {activeTab === "agents" && <AgentsPanel />}
        </div>
      </div>
    </div>
  );
}
