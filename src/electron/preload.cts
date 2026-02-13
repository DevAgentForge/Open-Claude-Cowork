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

    // Template APIs
    getTemplates: () =>
        ipcInvoke("get-templates"),
    getTemplate: (id: string) =>
        ipcInvoke("get-template", id),
    searchTemplates: (query: string) =>
        ipcInvoke("search-templates", query),
    addTemplate: (template: any) =>
        ipcInvoke("add-template", template),

    // Search APIs
    searchSessions: (query: string, options?: any) =>
        ipcInvoke("search-sessions", query, options),
    searchMessages: (sessionId: string, query: string, options?: any) =>
        ipcInvoke("search-messages", sessionId, query, options),
    advancedSearch: (filters: any) =>
        ipcInvoke("advanced-search", filters),

    // Audit Log APIs
    getAuditLogs: (sessionId: string, options?: any) =>
        ipcInvoke("get-audit-logs", sessionId, options),
    getRecentLogs: (limit?: number) =>
        ipcInvoke("get-recent-logs", limit),
    getAuditStatistics: (sessionId?: string) =>
        ipcInvoke("get-audit-statistics", sessionId),
    exportAuditLogs: (options: any, format: 'json' | 'csv') =>
        ipcInvoke("export-audit-logs", options, format),
    cleanupAuditLogs: (beforeDate: number) =>
        ipcInvoke("cleanup-audit-logs", beforeDate)
} satisfies Window['electron'])

function ipcInvoke<Key extends keyof EventPayloadMapping>(key: Key, ...args: any[]): Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key, ...args);
}

function ipcOn<Key extends keyof EventPayloadMapping>(key: Key, callback: (payload: EventPayloadMapping[Key]) => void) {
    const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload)
    electron.ipcRenderer.on(key, cb);
    return () => electron.ipcRenderer.off(key, cb)
}
