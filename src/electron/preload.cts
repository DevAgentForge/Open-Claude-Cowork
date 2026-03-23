import electron from "electron";

electron.contextBridge.exposeInMainWorld("electron", {
    subscribeStatistics: (callback) =>
        ipcOn("statistics", stats => {
            callback(stats);
        }),
    getStaticData: () => ipcInvoke("getStaticData"),

    // Claude Agent IPC APIs
    sendClientEvent: (event: any) => {
        electron.ipcRenderer.send("client-event", event);
    },
    onServerEvent: (callback: (event: any) => void) => {
        const cb = (_: Electron.IpcRendererEvent, payload: string) => {
            try {
                const event = JSON.parse(payload);
                callback(event);
            } catch (error) {
                console.error("Failed to parse server event:", error);
            }
        };
        electron.ipcRenderer.on("server-event", cb);
        return () => electron.ipcRenderer.off("server-event", cb);
    },
    generateSessionTitle: (userInput: string | null) =>
        ipcInvoke("generate-session-title", userInput),
    getRecentCwds: (limit?: number) =>
        ipcInvoke("get-recent-cwds", limit),
    selectDirectory: () =>
        ipcInvoke("select-directory"),
    getApiConfig: () =>
        ipcInvoke("get-api-config"),
    saveApiConfig: (config: any) =>
        ipcInvoke("save-api-config", config),
    checkApiConfig: () =>
        ipcInvoke("check-api-config"),

    // MCP APIs
    getMCPServers: () =>
        ipcInvoke("mcp-get-servers"),
    enableMCPServer: (serverId: string) =>
        ipcInvoke("mcp-enable-server", serverId),
    disableMCPServer: (serverId: string) =>
        ipcInvoke("mcp-disable-server", serverId),
    enableBrowserAutomation: () =>
        ipcInvoke("mcp-enable-browser-automation"),
    addMCPServer: (config: any) =>
        ipcInvoke("mcp-add-server", config),
    updateMCPServer: (serverId: string, config: any) =>
        ipcInvoke("mcp-update-server", serverId, config),
    deleteMCPServer: (serverId: string) =>
        ipcInvoke("mcp-delete-server", serverId),
    onMCPStatusChange: (callback: (serverId: string, status: MCPServerStatus, error?: string) => void) => {
        const cb = (_: Electron.IpcRendererEvent, serverId: string, status: MCPServerStatus, error?: string) => {
            callback(serverId, status, error);
        };
        electron.ipcRenderer.on("mcp-status-change", cb);
        return () => electron.ipcRenderer.off("mcp-status-change", cb);
    },
    // 浏览器 MCP 配置 API
    updateBrowserConfig: (options: {
        browserMode?: 'visible' | 'headless';
        userDataDir?: string | null;
        enablePersistence?: boolean;
        persistBrowser?: boolean;
    }) => ipcInvoke("mcp-update-browser-config", options),
    getDefaultUserDataDir: () =>
        ipcInvoke("mcp-get-default-user-data-dir"),

    // Agent APIs
    getAgents: () =>
        ipcInvoke("agents-get-list"),
    addAgent: (agent: { name: string; description: string; prompt: string; model?: string }) =>
        ipcInvoke("agents-add", agent),
    updateAgent: (agentId: string, updates: { name?: string; description?: string; prompt?: string; model?: string }) =>
        ipcInvoke("agents-update", agentId, updates),
    deleteAgent: (agentId: string) =>
        ipcInvoke("agents-delete", agentId),
    toggleAgent: (agentId: string, enabled: boolean) =>
        ipcInvoke("agents-toggle", agentId, enabled),
    onAgentsConfigChange: (callback: () => void) => {
        const cb = () => callback();
        electron.ipcRenderer.on("agents-config-changed", cb);
        return () => electron.ipcRenderer.off("agents-config-changed", cb);
    },
} satisfies Window['electron'])

function ipcInvoke<Key extends keyof EventPayloadMapping>(key: Key, ...args: any[]): Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key, ...args);
}

function ipcOn<Key extends keyof EventPayloadMapping>(key: Key, callback: (payload: EventPayloadMapping[Key]) => void) {
    const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload)
    electron.ipcRenderer.on(key, cb);
    return () => electron.ipcRenderer.off(key, cb)
}
