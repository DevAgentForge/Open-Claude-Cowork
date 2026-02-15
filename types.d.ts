type Statistics = {
    cpuUsage: number;
    ramUsage: number;
    storageData: number;
}

type StaticData = {
    totalStorage: number;
    cpuModel: string;
    totalMemoryGB: number;
}

type UnsubscribeFunction = () => void;

type MCPServerStatus = "running" | "stopped" | "error" | "starting";

type MCPBrowserMode = "visible" | "headless";

type MCPServerInfo = {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    isBuiltin?: boolean;
    builtinType?: string;
    browserMode?: MCPBrowserMode;
    /** 用户数据目录（用于持久化浏览器会话） */
    userDataDir?: string;
    /** 是否跨对话保持浏览器 */
    persistBrowser?: boolean;
    status: MCPServerStatus;
    errorMessage?: string;
}

/** AI 助手信息 */
type SubAgentInfo = {
    id: string;
    name: string;
    description: string;
    prompt: string;
    enabled: boolean;
    model: string;
    isBuiltin: boolean;
    createdAt: string;
    updatedAt: string;
}

/** 浏览器 MCP 配置选项 */
type MCPBrowserConfigOptions = {
    /** 浏览器运行模式：visible（可见）或 headless（无界面） */
    browserMode?: MCPBrowserMode;
    /** 用户数据目录（null 表示清除） */
    userDataDir?: string | null;
    /** 便捷选项：是否启用会话持久化 */
    enablePersistence?: boolean;
    /** 是否跨对话保持浏览器（使用 SSE 模式） */
    persistBrowser?: boolean;
}

/** 浏览器 MCP 配置更新结果 */
type MCPBrowserConfigResult = {
    success: boolean;
    browserMode?: MCPBrowserMode;
    userDataDir?: string;
    /** 是否跨对话保持浏览器 */
    persistBrowser?: boolean;
}

type EventPayloadMapping = {
    statistics: Statistics;
    getStaticData: StaticData;
    "generate-session-title": string;
    "get-recent-cwds": string[];
    "select-directory": string | null;
    "get-api-config": { apiKey: string; baseURL: string; model: string; apiType?: "anthropic" } | null;
    "save-api-config": { success: boolean; error?: string };
    "check-api-config": { hasConfig: boolean; config: { apiKey: string; baseURL: string; model: string; apiType?: "anthropic" } | null };
    // MCP APIs
    "mcp-get-servers": MCPServerInfo[];
    "mcp-enable-server": { success: boolean };
    "mcp-disable-server": { success: boolean };
    "mcp-enable-browser-automation": { success: boolean };
    "mcp-add-server": { success: boolean; serverId: string };
    "mcp-update-server": { success: boolean };
    "mcp-delete-server": { success: boolean };
    "mcp-update-browser-config": MCPBrowserConfigResult;
    "mcp-get-default-user-data-dir": string;
    // Agent APIs
    "agents-get-list": SubAgentInfo[];
    "agents-add": { success: boolean; agentId: string };
    "agents-update": { success: boolean };
    "agents-delete": { success: boolean };
    "agents-toggle": { success: boolean };
}

type MCPServerFormData = {
    name: string;
    description?: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    transportType: "stdio" | "sse";
}

interface Window {
    electron: {
        subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
        getStaticData: () => Promise<StaticData>;
        // Claude Agent IPC APIs
        sendClientEvent: (event: any) => void;
        onServerEvent: (callback: (event: any) => void) => UnsubscribeFunction;
        generateSessionTitle: (userInput: string | null) => Promise<string>;
        getRecentCwds: (limit?: number) => Promise<string[]>;
        selectDirectory: () => Promise<string | null>;
        getApiConfig: () => Promise<{ apiKey: string; baseURL: string; model: string; apiType?: "anthropic" } | null>;
        saveApiConfig: (config: { apiKey: string; baseURL: string; model: string; apiType?: "anthropic" }) => Promise<{ success: boolean; error?: string }>;
        checkApiConfig: () => Promise<{ hasConfig: boolean; config: { apiKey: string; baseURL: string; model: string; apiType?: "anthropic" } | null }>;
        // MCP APIs
        getMCPServers: () => Promise<MCPServerInfo[]>;
        enableMCPServer: (serverId: string) => Promise<{ success: boolean }>;
        disableMCPServer: (serverId: string) => Promise<{ success: boolean }>;
        enableBrowserAutomation: () => Promise<{ success: boolean }>;
        addMCPServer: (config: MCPServerFormData) => Promise<{ success: boolean; serverId: string }>;
        updateMCPServer: (serverId: string, config: Partial<MCPServerFormData>) => Promise<{ success: boolean }>;
        deleteMCPServer: (serverId: string) => Promise<{ success: boolean }>;
        onMCPStatusChange: (callback: (serverId: string, status: MCPServerStatus, error?: string) => void) => UnsubscribeFunction;
        // 浏览器 MCP 配置 API
        updateBrowserConfig: (options: MCPBrowserConfigOptions) => Promise<MCPBrowserConfigResult>;
        getDefaultUserDataDir: () => Promise<string>;
        // Agent APIs
        getAgents: () => Promise<SubAgentInfo[]>;
        addAgent: (agent: { name: string; description: string; prompt: string; model?: string }) => Promise<{ success: boolean; agentId: string }>;
        updateAgent: (agentId: string, updates: { name?: string; description?: string; prompt?: string; model?: string }) => Promise<{ success: boolean }>;
        deleteAgent: (agentId: string) => Promise<{ success: boolean }>;
        toggleAgent: (agentId: string, enabled: boolean) => Promise<{ success: boolean }>;
        onAgentsConfigChange: (callback: () => void) => UnsubscribeFunction;
    }
}
