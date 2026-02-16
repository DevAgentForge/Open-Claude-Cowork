/**
 * MCP (Model Context Protocol) 模块
 * 
 * 提供 MCP Server 配置管理功能
 * 注意：MCP Server 进程由 Claude SDK 自动管理
 * 
 * @module mcp
 * 
 * 模块结构：
 * - mcp-config: 类型定义和常量
 * - mcp-store: 配置持久化存储
 * - mcp-manager: 配置管理器
 * - mcp-ipc-handlers: IPC 处理器
 * - builtin-servers: 内置 Server 配置
 * - browser-process-manager: Chrome 浏览器进程管理（CDP 模式）
 */

// ============ 类型定义 ============
export type {
    MCPServerStatus,
    MCPBrowserMode,
    MCPTransportType,
    MCPServerConfig,
    MCPServerRuntimeState,
    MCPConfigState,
    MCPGlobalSettings,
    MCPServerInfo,
    MCPConfigChangeEvent,
    MCPToolInfo,
    MCPServerTools,
} from "./mcp-config.js";

export {
    DEFAULT_GLOBAL_SETTINGS,
    DEFAULT_MCP_CONFIG_STATE,
} from "./mcp-config.js";

// ============ 配置存储 ============
export {
    loadMCPConfig,
    saveMCPConfig,
    getMCPServerById,
    addMCPServer,
    updateMCPServer,
    removeMCPServer,
    toggleMCPServer,
    updateGlobalSettings,
    getEnabledServers,
    generateServerId,
} from "./mcp-store.js";

// ============ 配置管理 ============
export { MCPManager, getMCPManager } from "./mcp-manager.js";

// ============ 内置 Server ============
export type { BuiltinServerType } from "./builtin-servers.js";
export {
    PLAYWRIGHT_SERVER_ID,
    createPlaywrightServerConfig,
    updatePlaywrightConfig,
    getDefaultUserDataDir,
    buildPlaywrightArgs,
    getBuiltinServerTemplates,
    isBuiltinServer,
    checkNodeEnvironment,
    checkNpxAvailable,
    preflightPlaywrightCheck,
} from "./builtin-servers.js";

// ============ 浏览器进程管理 ============
export { BrowserProcessManager, getBrowserProcessManager } from "./browser-process-manager.js";
export type { BrowserProcessStatus, BrowserProcessConfig } from "./browser-process-manager.js";

// ============ IPC 处理器 ============
export { setupMCPHandlers, cleanupMCP } from "./mcp-ipc-handlers.js";
