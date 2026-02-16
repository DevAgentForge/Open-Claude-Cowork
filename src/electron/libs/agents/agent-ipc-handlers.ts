/**
 * Sub Agent IPC 处理器
 * 处理渲染进程与主进程之间的 AI 助手配置相关通信
 */

import { BrowserWindow, ipcMain } from "electron";
import { getAgentManager, AgentManager } from "./agent-manager.js";
import { isBuiltinAgent } from "./builtin-agents.js";
import type { SubAgentConfig } from "./agent-config.js";

let mainWindow: BrowserWindow | null = null;
let manager: AgentManager | null = null;

/**
 * 设置 Agent IPC 处理器
 */
export function setupAgentHandlers(win: BrowserWindow): void {
    mainWindow = win;
    manager = getAgentManager();

    // 监听配置变化并广播到渲染进程
    manager.on("config-changed", () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("agents-config-changed");
        }
    });

    // 获取所有 AI 助手列表
    ipcMain.handle("agents-get-list", async () => {
        if (!manager) return [];
        return manager.getAgents();
    });

    // 添加自定义助手
    ipcMain.handle("agents-add", async (_, agentData: {
        name: string;
        description: string;
        prompt: string;
        model?: string;
    }) => {
        if (!manager) throw new Error("Agent Manager not initialized");

        // 检查名称唯一性
        const existing = manager.getAgents();
        if (existing.some((a) => a.name === agentData.name)) {
            throw new Error(`助手名称"${agentData.name}"已存在，请使用其他名称`);
        }

        const newAgent = manager.addAgent({
            name: agentData.name,
            description: agentData.description,
            prompt: agentData.prompt,
            enabled: true,
            model: agentData.model || "inherit",
        });

        return { success: true, agentId: newAgent.id };
    });

    // 更新助手配置
    ipcMain.handle("agents-update", async (_, agentId: string, updates: {
        name?: string;
        description?: string;
        prompt?: string;
        model?: string;
    }) => {
        if (!manager) throw new Error("Agent Manager not initialized");

        // 如果修改了名称，检查唯一性
        if (updates.name) {
            const existing = manager.getAgents();
            if (existing.some((a) => a.name === updates.name && a.id !== agentId)) {
                throw new Error(`助手名称"${updates.name}"已存在，请使用其他名称`);
            }
        }

        manager.updateAgentById(agentId, updates as Partial<SubAgentConfig>);
        return { success: true };
    });

    // 删除自定义助手
    ipcMain.handle("agents-delete", async (_, agentId: string) => {
        if (!manager) throw new Error("Agent Manager not initialized");

        if (isBuiltinAgent(agentId)) {
            throw new Error("内置助手不可删除");
        }

        manager.removeAgent(agentId);
        return { success: true };
    });

    // 切换助手启用/禁用状态
    ipcMain.handle("agents-toggle", async (_, agentId: string, enabled: boolean) => {
        if (!manager) throw new Error("Agent Manager not initialized");

        manager.toggleAgent(agentId, enabled);
        return { success: true };
    });
}

/**
 * 清理 Agent 资源
 */
export function cleanupAgents(): void {
    mainWindow = null;
    manager = null;
}
