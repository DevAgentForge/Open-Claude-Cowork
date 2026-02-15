/**
 * MCP 配置管理核心模块 - 类型定义
 * 用于定义 MCP Server 配置的 TypeScript 接口
 */

/** MCP Server 运行状态 */
export type MCPServerStatus = "running" | "stopped" | "error" | "starting";

/** MCP Server 运行模式（针对浏览器工具） */
export type MCPBrowserMode = "visible" | "headless";

/** MCP Server 传输类型 */
export type MCPTransportType = "stdio" | "sse";

/** 单个 MCP Server 配置 */
export interface MCPServerConfig {
    /** 唯一标识符 */
    id: string;
    /** 显示名称 */
    name: string;
    /** 描述信息 */
    description?: string;
    /** 启动命令 */
    command: string;
    /** 命令参数 */
    args?: string[];
    /** 环境变量 */
    env?: Record<string, string>;
    /** 传输类型 */
    transportType: MCPTransportType;
    /** 是否已启用 */
    enabled: boolean;
    /** 是否为内置工具 */
    isBuiltin?: boolean;
    /** 内置工具类型（如 playwright） */
    builtinType?: string;
    /** 浏览器运行模式（仅对浏览器工具有效） */
    browserMode?: MCPBrowserMode;
    /** 用户数据目录（用于持久化浏览器会话，仅对浏览器工具有效） */
    userDataDir?: string;
    /** 
     * 是否跨对话保持浏览器（仅对浏览器工具有效）
     * 启用后将通过 CDP 连接到独立运行的浏览器进程，浏览器状态和页面可跨多次对话保持
     */
    persistBrowser?: boolean;
    /** 创建时间 */
    createdAt: string;
    /** 更新时间 */
    updatedAt: string;
}

/** MCP Server 运行时状态 */
export interface MCPServerRuntimeState {
    /** Server ID */
    serverId: string;
    /** 运行状态 */
    status: MCPServerStatus;
    /** 错误信息（如果有） */
    errorMessage?: string;
    /** 错误详情/日志 */
    errorDetails?: string;
    /** 进程 PID（如果正在运行） */
    pid?: number;
    /** 重启次数 */
    restartCount: number;
    /** 最后一次启动时间 */
    lastStartTime?: string;
    /** 最后一次停止时间 */
    lastStopTime?: string;
}

/** MCP 配置整体状态 */
export interface MCPConfigState {
    /** 配置版本号（用于迁移） */
    version: number;
    /** 所有 MCP Server 配置列表 */
    servers: MCPServerConfig[];
    /** 全局设置 */
    globalSettings: MCPGlobalSettings;
}

/** MCP 全局设置 */
export interface MCPGlobalSettings {
    /** 是否在应用启动时自动启动已启用的 Server */
    autoStartOnLaunch: boolean;
    /** Server 启动超时时间（毫秒） */
    startupTimeout: number;
    /** 最大自动重启次数 */
    maxRestartAttempts: number;
}

/** 默认全局设置 */
export const DEFAULT_GLOBAL_SETTINGS: MCPGlobalSettings = {
    autoStartOnLaunch: true,
    startupTimeout: 30000, // 30秒
    maxRestartAttempts: 3,
};

/** 默认配置状态 */
export const DEFAULT_MCP_CONFIG_STATE: MCPConfigState = {
    version: 1,
    servers: [],
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
};

/** 用于 IPC 通信的 MCP Server 状态信息 */
export interface MCPServerInfo {
    config: MCPServerConfig;
    runtime: MCPServerRuntimeState;
}

/** MCP 配置变更事件类型 */
export type MCPConfigChangeEvent =
    | { type: "server-added"; server: MCPServerConfig }
    | { type: "server-updated"; server: MCPServerConfig }
    | { type: "server-removed"; serverId: string }
    | { type: "server-status-changed"; serverId: string; status: MCPServerStatus; error?: string }
    | { type: "global-settings-updated"; settings: MCPGlobalSettings };

/** MCP 工具信息（从 MCP Server 获取） */
export interface MCPToolInfo {
    /** 工具名称 */
    name: string;
    /** 工具描述 */
    description?: string;
    /** 输入参数 Schema */
    inputSchema?: object;
}

/** MCP Server 提供的工具列表 */
export interface MCPServerTools {
    serverId: string;
    tools: MCPToolInfo[];
}
