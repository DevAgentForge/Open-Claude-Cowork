/**
 * MCP 配置存储模块
 * 负责 MCP 配置的读取、保存、校验逻辑
 */

import { app } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import {
    MCPConfigState,
    MCPServerConfig,
    MCPGlobalSettings,
    MCPBrowserMode,
    DEFAULT_MCP_CONFIG_STATE,
    DEFAULT_GLOBAL_SETTINGS,
} from "./mcp-config.js";
import {
    PLAYWRIGHT_SERVER_ID,
    createPlaywrightServerConfig,
} from "./builtin-servers.js";

const CONFIG_FILE_NAME = "mcp-config.json";

/** 获取配置文件路径 */
function getConfigPath(): string {
    const userDataPath = app.getPath("userData");
    return join(userDataPath, CONFIG_FILE_NAME);
}

/** 验证 MCP Server 配置格式 */
function validateServerConfig(server: Partial<MCPServerConfig>): server is MCPServerConfig {
    return !!(
        server.id &&
        server.name &&
        server.command &&
        server.transportType &&
        typeof server.enabled === "boolean"
    );
}

/** 验证整体配置格式 */
function validateConfigState(config: unknown): config is MCPConfigState {
    if (!config || typeof config !== "object") return false;
    const c = config as MCPConfigState;

    if (typeof c.version !== "number") return false;
    if (!Array.isArray(c.servers)) return false;
    if (!c.globalSettings || typeof c.globalSettings !== "object") return false;

    // 验证每个 server 配置
    for (const server of c.servers) {
        if (!validateServerConfig(server)) return false;
    }

    return true;
}

/** 迁移旧版本配置（未来扩展用） */
function migrateConfig(config: MCPConfigState): MCPConfigState {
    // 目前版本为 1，无需迁移
    // 未来如果配置格式变化，在这里处理迁移逻辑
    return config;
}

/**
 * 修复内置 Server 配置
 * 确保内置 Server 始终使用最新的命令和参数格式
 */
function fixBuiltinServerConfigs(config: MCPConfigState): MCPConfigState {
    const fixedServers = config.servers.map((server: MCPServerConfig) => {
        // 修复 Playwright 内置 Server
        if (server.id === PLAYWRIGHT_SERVER_ID || server.builtinType === "playwright") {
            const browserMode: MCPBrowserMode = server.browserMode || "visible";
            const latestConfig = createPlaywrightServerConfig(browserMode);

            // 保留用户的启用状态、浏览器持久化设置和时间戳，但更新命令和参数
            return {
                ...latestConfig,
                enabled: server.enabled,
                browserMode: server.browserMode ?? latestConfig.browserMode,
                userDataDir: server.userDataDir ?? latestConfig.userDataDir,
                persistBrowser: server.persistBrowser ?? latestConfig.persistBrowser,
                createdAt: server.createdAt || latestConfig.createdAt,
                updatedAt: latestConfig.updatedAt,
            };
        }

        return server;
    });

    return {
        ...config,
        servers: fixedServers,
    };
}

/**
 * 加载 MCP 配置
 * @returns 配置对象，如果配置不存在或损坏则返回默认配置
 */
export function loadMCPConfig(): MCPConfigState {
    try {
        const configPath = getConfigPath();

        if (!existsSync(configPath)) {
            console.info("[mcp-store] Config file not found, using default config");
            return { ...DEFAULT_MCP_CONFIG_STATE };
        }

        const raw = readFileSync(configPath, "utf8");
        const config = JSON.parse(raw);

        if (!validateConfigState(config)) {
            console.warn("[mcp-store] Invalid config format, using default config");
            return { ...DEFAULT_MCP_CONFIG_STATE };
        }

        // 迁移配置（如果需要）
        const migratedConfig = migrateConfig(config);

        // 修复内置 Server 配置（确保使用最新的命令格式）
        const fixedConfig = fixBuiltinServerConfigs(migratedConfig);

        // 确保全局设置包含所有字段（兼容旧配置）
        fixedConfig.globalSettings = {
            ...DEFAULT_GLOBAL_SETTINGS,
            ...fixedConfig.globalSettings,
        };

        console.info(`[mcp-store] Loaded MCP config with ${fixedConfig.servers.length} servers`);
        return fixedConfig;
    } catch (error) {
        console.error("[mcp-store] Failed to load MCP config:", error);
        return { ...DEFAULT_MCP_CONFIG_STATE };
    }
}

/**
 * 保存 MCP 配置
 * @param config 配置对象
 */
export function saveMCPConfig(config: MCPConfigState): void {
    try {
        const configPath = getConfigPath();
        const userDataPath = app.getPath("userData");

        // 确保目录存在
        if (!existsSync(userDataPath)) {
            mkdirSync(userDataPath, { recursive: true });
        }

        // 更新服务器配置的更新时间
        const updatedConfig = {
            ...config,
            servers: config.servers.map((server: MCPServerConfig) => ({
                ...server,
                updatedAt: new Date().toISOString(),
            })),
        };

        writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), "utf8");
        console.info("[mcp-store] MCP config saved successfully");
    } catch (error) {
        console.error("[mcp-store] Failed to save MCP config:", error);
        throw error;
    }
}

/**
 * 获取指定 ID 的 MCP Server 配置
 */
export function getMCPServerById(config: MCPConfigState, serverId: string): MCPServerConfig | undefined {
    return config.servers.find((s: MCPServerConfig) => s.id === serverId);
}

/**
 * 添加新的 MCP Server 配置
 */
export function addMCPServer(config: MCPConfigState, server: Omit<MCPServerConfig, "createdAt" | "updatedAt">): MCPConfigState {
    const now = new Date().toISOString();
    const newServer: MCPServerConfig = {
        ...server,
        createdAt: now,
        updatedAt: now,
    };

    return {
        ...config,
        servers: [...config.servers, newServer],
    };
}

/**
 * 更新 MCP Server 配置
 */
export function updateMCPServer(config: MCPConfigState, serverId: string, updates: Partial<MCPServerConfig>): MCPConfigState {
    return {
        ...config,
        servers: config.servers.map((s: MCPServerConfig) =>
            s.id === serverId
                ? { ...s, ...updates, updatedAt: new Date().toISOString() }
                : s
        ),
    };
}

/**
 * 删除 MCP Server 配置
 */
export function removeMCPServer(config: MCPConfigState, serverId: string): MCPConfigState {
    return {
        ...config,
        servers: config.servers.filter((s: MCPServerConfig) => s.id !== serverId),
    };
}

/**
 * 启用/禁用 MCP Server
 */
export function toggleMCPServer(config: MCPConfigState, serverId: string, enabled: boolean): MCPConfigState {
    return updateMCPServer(config, serverId, { enabled });
}

/**
 * 更新全局设置
 */
export function updateGlobalSettings(config: MCPConfigState, settings: Partial<MCPGlobalSettings>): MCPConfigState {
    return {
        ...config,
        globalSettings: {
            ...config.globalSettings,
            ...settings,
        },
    };
}

/**
 * 获取所有已启用的 MCP Server
 */
export function getEnabledServers(config: MCPConfigState): MCPServerConfig[] {
    return config.servers.filter((s: MCPServerConfig) => s.enabled);
}

/**
 * 生成唯一的 Server ID
 */
export function generateServerId(): string {
    return `mcp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
