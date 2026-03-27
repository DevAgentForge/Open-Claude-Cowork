import { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu, IpcMainInvokeEvent } from "electron"
import { execSync } from "child_process";
import { ipcMainHandle, isDev, DEV_PORT } from "./util.js";
import { getPreloadPath, getUIPath, getIconPath } from "./pathResolver.js";
import { getStaticData, pollResources, stopPolling } from "./test.js";
import { handleClientEvent, sessions, cleanupAllSessions } from "./ipc-handlers.js";
import { generateSessionTitle } from "./libs/util.js";
import { saveApiConfig } from "./libs/config-store.js";
import { getCurrentApiConfig } from "./libs/claude-settings.js";
import { templateManager } from "./libs/templates/index.js";
import { AuditLogger } from "./libs/audit/index.js";
import type { ClientEvent, SessionStatus } from "./types.js";
import type { SessionTemplate } from "./libs/templates/types.js";
import type { AuditQueryOptions } from "./libs/audit/types.js";
import "./libs/claude-settings.js";

let cleanupComplete = false;
let mainWindow: BrowserWindow | null = null;
let auditLogger: AuditLogger | null = null;

function killViteDevServer(): void {
    if (!isDev()) return;
    try {
        if (process.platform === 'win32') {
            execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${DEV_PORT}') do taskkill /PID %a /F`, { stdio: 'ignore', shell: 'cmd.exe' });
        } else {
            execSync(`lsof -ti:${DEV_PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
        }
    } catch {
        // Process may already be dead
    }
}

function cleanup(): void {
    if (cleanupComplete) return;
    cleanupComplete = true;

    globalShortcut.unregisterAll();
    stopPolling();
    cleanupAllSessions();
    killViteDevServer();
}

function handleSignal(): void {
    cleanup();
    app.quit();
}

// Initialize everything when app is ready
app.on("ready", () => {
    Menu.setApplicationMenu(null);
    
    // Initialize audit logger
    const DB_PATH = app.getPath("userData");
    auditLogger = new AuditLogger(`${DB_PATH}/audit.db`);
    
    // Setup event handlers
    app.on("before-quit", cleanup);
    app.on("will-quit", cleanup);
    app.on("window-all-closed", () => {
        cleanup();
        app.quit();
    });

    process.on("SIGTERM", handleSignal);
    process.on("SIGINT", handleSignal);
    process.on("SIGHUP", handleSignal);

    // Create main window
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: getPreloadPath(),
        },
        icon: getIconPath(),
        titleBarStyle: "hiddenInset",
        backgroundColor: "#FAF9F6",
        trafficLightPosition: { x: 15, y: 18 }
    });

    if (isDev()) mainWindow.loadURL(`http://localhost:${DEV_PORT}`)
    else mainWindow.loadFile(getUIPath());

    globalShortcut.register('CommandOrControl+Q', () => {
        cleanup();
        app.quit();
    });

    pollResources(mainWindow);

    ipcMainHandle("getStaticData", () => {
        return getStaticData();
    });

    // Handle client events
    ipcMain.on("client-event", (_: IpcMainInvokeEvent, event: ClientEvent) => {
        handleClientEvent(event);
    });

    // Handle session title generation
    ipcMainHandle("generate-session-title", async (_: IpcMainInvokeEvent, userInput: string | null) => {
        return await generateSessionTitle(userInput);
    });

    // Handle recent cwds request
    ipcMainHandle("get-recent-cwds", (_: IpcMainInvokeEvent, limit?: number) => {
        const boundedLimit = limit ? Math.min(Math.max(limit, 1), 20) : 8;
        return sessions.listRecentCwds(boundedLimit);
    });

    // Handle directory selection
    ipcMainHandle("select-directory", async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            properties: ['openDirectory']
        });

        if (result.canceled) {
            return null;
        }

        return result.filePaths[0];
    });

    // Handle API config
    ipcMainHandle("get-api-config", () => {
        return getCurrentApiConfig();
    });

    ipcMainHandle("check-api-config", () => {
        const config = getCurrentApiConfig();
        return { hasConfig: config !== null, config };
    });

    ipcMainHandle("save-api-config", (_: IpcMainInvokeEvent, config: { apiKey: string; baseURL: string; model: string; apiType?: "anthropic" }) => {
        try {
            saveApiConfig(config);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    });

    // Handle template requests
    ipcMainHandle("get-templates", () => {
        return templateManager.getTemplates();
    });

    ipcMainHandle("get-template", (_: IpcMainInvokeEvent, id: string) => {
        return templateManager.getTemplate(id);
    });

    ipcMainHandle("search-templates", (_: IpcMainInvokeEvent, query: string) => {
        return templateManager.searchTemplates(query);
    });

    ipcMainHandle("add-template", (_: IpcMainInvokeEvent, template: SessionTemplate) => {
        try {
            templateManager.addTemplate(template);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    });

    // Handle search requests
    ipcMainHandle("search-sessions", (_: IpcMainInvokeEvent, query: string, options?: { limit?: number; includeMessages?: boolean; status?: SessionStatus; startDate?: number; endDate?: number; offset?: number; cwd?: string }) => {
        return sessions.searchSessions(query, options);
    });

    ipcMainHandle("search-messages", (_: IpcMainInvokeEvent, sessionId: string, query: string, options?: { limit?: number; includeContext?: boolean }) => {
        return sessions.searchMessages(sessionId, query, options);
    });

    ipcMainHandle("advanced-search", (_: IpcMainInvokeEvent, filters: { query?: string; status?: SessionStatus; cwd?: string; startDate?: number; endDate?: number; limit?: number; offset?: number }) => {
        return sessions.advancedSearch(filters);
    });

    // Handle audit log requests
    ipcMainHandle("get-audit-logs", (_: IpcMainInvokeEvent, sessionId: string, options?: AuditQueryOptions) => {
        if (!auditLogger) return [];
        return auditLogger.getSessionLogs(sessionId, options);
    });

    ipcMainHandle("get-recent-logs", (_: IpcMainInvokeEvent, limit?: number) => {
        if (!auditLogger) return [];
        return auditLogger.getRecentLogs(limit);
    });

    ipcMainHandle("get-audit-statistics", (_: IpcMainInvokeEvent, sessionId?: string) => {
        if (!auditLogger) return null;
        return auditLogger.getStatistics(sessionId);
    });

    ipcMainHandle("export-audit-logs", (_: IpcMainInvokeEvent, options: AuditQueryOptions, format: 'json' | 'csv') => {
        if (!auditLogger) return '';
        return auditLogger.exportLogs(options, format);
    });

    ipcMainHandle("cleanup-audit-logs", (_: IpcMainInvokeEvent, beforeDate: number) => {
        if (!auditLogger) return 0;
        return auditLogger.cleanup(beforeDate);
    });
})
