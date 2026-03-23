/**
 * MCP IPC 处理器
 * 处理渲染进程与主进程之间的 MCP 配置相关通信
 * 注意：MCP Server 进程由 Claude SDK 自动管理，这里只处理配置
 */

import { BrowserWindow, ipcMain } from "electron";
import { getMCPManager, MCPManager } from "./mcp-manager.js";
import {
    addMCPServer,
    updateMCPServer,
    removeMCPServer,
    toggleMCPServer,
    getMCPServerById,
    generateServerId,
} from "./mcp-store.js";
import {
    createPlaywrightServerConfig,
    updatePlaywrightConfig,
    getDefaultUserDataDir,
    PLAYWRIGHT_SERVER_ID,
    preflightPlaywrightCheck,
} from "./builtin-servers.js";
import type { MCPBrowserMode } from "./mcp-config.js";
import type {
    MCPServerConfig,
    MCPTransportType,
} from "./mcp-config.js";

let mainWindow: BrowserWindow | null = null;
let manager: MCPManager | null = null;

/** IPC 响应用的 Server 信息（扁平化结构，便于前端使用） */
interface IPCServerInfo {
    id: string;
    name: string;
    description?: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    transportType: MCPTransportType;
    enabled: boolean;
    isBuiltin?: boolean;
    builtinType?: string;
    browserMode?: "visible" | "headless";
    /** 用户数据目录（用于持久化浏览器会话） */
    userDataDir?: string;
    /** 是否跨对话保持浏览器 */
    persistBrowser?: boolean;
}

/**
 * 将 Server 配置转换为 IPC 可传输的信息
 */
function toServerInfo(config: MCPServerConfig): IPCServerInfo {
    return {
        id: config.id,
        name: config.name,
        description: config.description,
        command: config.command,
        args: config.args,
        env: config.env,
        transportType: config.transportType,
        enabled: config.enabled,
        isBuiltin: config.isBuiltin,
        builtinType: config.builtinType,
        browserMode: config.browserMode,
        userDataDir: config.userDataDir,
        persistBrowser: config.persistBrowser,
    };
}

/**
 * 设置 MCP IPC 处理器
 */
export function setupMCPHandlers(win: BrowserWindow): void {
    mainWindow = win;
    manager = getMCPManager();

    // 监听配置变化并广播到渲染进程
    manager.on("config-changed", () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("mcp-config-changed");
        }
    });

    // 获取所有 MCP Server
    ipcMain.handle("mcp-get-servers", async () => {
        if (!manager) return [];

        const config = manager.getConfig();
        return config.servers.map((s: MCPServerConfig) => toServerInfo(s));
    });

    // 启用 MCP Server
    ipcMain.handle("mcp-enable-server", async (_, serverId: string) => {
        if (!manager) throw new Error("MCP Manager not initialized");

        const config = manager.getConfig();
        const server = getMCPServerById(config, serverId);

        if (!server) {
            throw new Error(`Server not found: ${serverId}`);
        }

        // 更新配置（SDK 会在下次对话时自动启动）
        const newConfig = toggleMCPServer(config, serverId, true);
        manager.updateConfig(newConfig);

        return { success: true };
    });

    // 禁用 MCP Server
    ipcMain.handle("mcp-disable-server", async (_, serverId: string) => {
        if (!manager) throw new Error("MCP Manager not initialized");

        // 更新配置
        const config = manager.getConfig();
        const newConfig = toggleMCPServer(config, serverId, false);
        manager.updateConfig(newConfig);

        return { success: true };
    });

    // 一键启用浏览器自动化
    ipcMain.handle("mcp-enable-browser-automation", async () => {
        if (!manager) throw new Error("MCP Manager not initialized");

        // 预检查环境
        const preflight = await preflightPlaywrightCheck();
        if (!preflight.ready) {
            throw new Error(`环境检查失败: ${preflight.issues.join(", ")}\n建议: ${preflight.suggestions.join(", ")}`);
        }

        let config = manager.getConfig();

        // 检查是否已存在 Playwright Server
        let server = getMCPServerById(config, PLAYWRIGHT_SERVER_ID);

        if (!server) {
            // 创建新的 Playwright Server 配置
            const playwrightConfig = createPlaywrightServerConfig("visible");
            config = addMCPServer(config, playwrightConfig);
            server = playwrightConfig;
        }

        // 启用并保存配置（SDK 会在下次对话时自动启动）
        config = toggleMCPServer(config, PLAYWRIGHT_SERVER_ID, true);
        manager.updateConfig(config);

        return { success: true };
    });

    // 添加新的 MCP Server
    ipcMain.handle("mcp-add-server", async (_, serverConfig: {
        name: string;
        description?: string;
        command: string;
        args?: string[];
        env?: Record<string, string>;
        transportType: "stdio" | "sse";
    }) => {
        if (!manager) throw new Error("MCP Manager not initialized");

        const serverId = generateServerId();

        const newServer: Omit<MCPServerConfig, "createdAt" | "updatedAt"> = {
            id: serverId,
            name: serverConfig.name,
            description: serverConfig.description,
            command: serverConfig.command,
            args: serverConfig.args,
            env: serverConfig.env,
            transportType: serverConfig.transportType as MCPTransportType,
            enabled: false,
            isBuiltin: false,
        };

        let config = manager.getConfig();
        config = addMCPServer(config, newServer);
        manager.updateConfig(config);

        return { success: true, serverId };
    });

    // 更新 MCP Server 配置
    ipcMain.handle("mcp-update-server", async (_, serverId: string, updates: {
        name?: string;
        description?: string;
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        transportType?: "stdio" | "sse";
    }) => {
        if (!manager) throw new Error("MCP Manager not initialized");

        let config = manager.getConfig();
        const server = getMCPServerById(config, serverId);

        if (!server) {
            throw new Error(`Server not found: ${serverId}`);
        }

        // 更新配置
        config = updateMCPServer(config, serverId, updates as Partial<MCPServerConfig>);
        manager.updateConfig(config);

        return { success: true };
    });

    // 删除 MCP Server
    ipcMain.handle("mcp-delete-server", async (_, serverId: string) => {
        if (!manager) throw new Error("MCP Manager not initialized");

        let config = manager.getConfig();
        const server = getMCPServerById(config, serverId);

        if (!server) {
            throw new Error(`Server not found: ${serverId}`);
        }

        // 不允许删除内置 Server
        if (server.isBuiltin) {
            throw new Error("Cannot delete builtin server");
        }

        // 从配置中移除
        config = removeMCPServer(config, serverId);
        manager.updateConfig(config);

        return { success: true };
    });

    // 更新浏览器自动化配置（headless 模式、持久化会话、跨对话保持）
    ipcMain.handle("mcp-update-browser-config", async (_, options: {
        browserMode?: MCPBrowserMode;
        userDataDir?: string | null;  // null 表示清除
        enablePersistence?: boolean;   // 便捷选项：是否启用持久化
        persistBrowser?: boolean;      // 是否跨对话保持浏览器
    }) => {
        if (!manager) throw new Error("MCP Manager not initialized");

        let config = manager.getConfig();
        const server = getMCPServerById(config, PLAYWRIGHT_SERVER_ID);

        if (!server) {
            throw new Error("Playwright server not found. Please enable browser automation first.");
        }

        // 处理 enablePersistence 便捷选项
        let userDataDir = options.userDataDir;
        if (options.enablePersistence === true && !userDataDir) {
            userDataDir = getDefaultUserDataDir();
        } else if (options.enablePersistence === false) {
            userDataDir = null;  // 清除持久化
        }

        // 更新 Playwright 配置
        const browserMode = options.browserMode ?? server.browserMode ?? "visible";
        const persistBrowser = options.persistBrowser;
        const updatedServer = updatePlaywrightConfig(server, browserMode, userDataDir, persistBrowser);

        // 更新配置
        config = updateMCPServer(config, PLAYWRIGHT_SERVER_ID, updatedServer);
        manager.updateConfig(config);

        // 如果启用了跨对话保持，尝试启动持久化浏览器（CDP 模式）
        if (updatedServer.persistBrowser && updatedServer.enabled) {
            try {
                await manager.ensureBrowserRunning();
            } catch (error) {
                console.error("Failed to start browser:", error);
                // 不抛出错误，配置已保存，下次对话时会重试
            }
        } else if (!updatedServer.persistBrowser) {
            // 如果禁用了跨对话保持，停止持久化浏览器
            await manager.stopBrowser();
        }

        return {
            success: true,
            browserMode: updatedServer.browserMode,
            userDataDir: updatedServer.userDataDir,
            persistBrowser: updatedServer.persistBrowser,
        };
    });

    // 获取默认的用户数据目录
    ipcMain.handle("mcp-get-default-user-data-dir", async () => {
        return getDefaultUserDataDir();
    });
}

/**
 * 清理 MCP 资源
 */
export function cleanupMCP(): void {
    mainWindow = null;
}
