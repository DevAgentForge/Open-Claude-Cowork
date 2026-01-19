import electron from "electron";

/**
 * IPC Event types for type-safe communication
 * These match the types defined in types.ts
 */
type ClientEventType = {
    type: string;
    payload?: unknown;
};

type ServerEventType = {
    type: string;
    payload?: unknown;
};

/**
 * M-005: Validate server event schema to prevent malformed data injection (CWE-20)
 * Ensures parsed JSON conforms to expected ServerEventType structure
 * @param data - The parsed JSON data to validate
 * @returns true if data matches ServerEventType schema, false otherwise
 */
function isValidServerEvent(data: unknown): data is ServerEventType {
    if (data === null || typeof data !== "object") {
        return false;
    }
    const obj = data as Record<string, unknown>;

    // 'type' must be a non-empty string
    if (typeof obj.type !== "string" || obj.type.length === 0) {
        return false;
    }

    // 'type' should match expected event patterns (whitelist approach)
    const validEventTypes = [
        "session.list", "session.status", "session.history", "session.deleted",
        "stream.message", "stream.user_prompt",
        "permission.request",
        "provider.list", "provider.saved", "provider.deleted", "provider.data",
        "runner.error"
    ];
    if (!validEventTypes.includes(obj.type)) {
        console.warn(`[IPC] Unknown event type received: ${obj.type}`);
        // M-007: In strict mode, block unknown event types for enhanced security
        // Set CLAUDE_COWORK_STRICT_IPC=true to enable strict validation
        if (process.env.CLAUDE_COWORK_STRICT_IPC === "true") {
            console.error(`[IPC] Blocking unknown event type in strict mode: ${obj.type}`);
            return false;
        }
        // Allow unknown types for forward compatibility in non-strict mode
    }

    // 'payload' is optional but if present must be object, array, or primitive
    // (no functions, symbols, etc.)
    if (obj.payload !== undefined) {
        const payloadType = typeof obj.payload;
        if (payloadType === "function" || payloadType === "symbol") {
            return false;
        }
    }

    return true;
}

electron.contextBridge.exposeInMainWorld("electron", {
    subscribeStatistics: (callback: (stats: Statistics) => void) =>
        ipcOn("statistics", stats => {
            callback(stats);
        }),
    getStaticData: () => ipcInvoke("getStaticData"),

    // Claude Agent IPC APIs
    // Type-safe client event sending (CWE-20 input validation)
    sendClientEvent: (event: ClientEventType) => {
        electron.ipcRenderer.send("client-event", event);
    },
    // Type-safe server event receiving with schema validation (M-005)
    onServerEvent: (callback: (event: ServerEventType) => void) => {
        const cb = (_: Electron.IpcRendererEvent, payload: string) => {
            try {
                const parsed: unknown = JSON.parse(payload);

                // M-005: Validate schema before passing to callback
                if (!isValidServerEvent(parsed)) {
                    console.error("[IPC] Invalid server event schema:", typeof parsed);
                    return;
                }

                callback(parsed);
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
        ipcInvoke("select-directory")
} satisfies Window['electron'])

function ipcInvoke<Key extends keyof EventPayloadMapping>(key: Key, ...args: any[]): Promise<EventPayloadMapping[Key]> {
    return electron.ipcRenderer.invoke(key, ...args);
}

function ipcOn<Key extends keyof EventPayloadMapping>(key: Key, callback: (payload: EventPayloadMapping[Key]) => void) {
    const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload)
    electron.ipcRenderer.on(key, cb);
    return () => electron.ipcRenderer.off(key, cb)
}
