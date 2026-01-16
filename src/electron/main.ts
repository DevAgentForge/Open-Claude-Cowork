import { app, ipcMain, dialog } from "electron"
import { ipcMainHandle } from "./util.js";
import { getPreloadPath } from "./pathResolver.js";
import { getStaticData, pollResources, cleanupPolling } from "./test.js";
import { handleClientEvent, sessions, initializeHandlers } from "./ipc-handlers.js";
import { generateSessionTitle } from "./libs/util.js";
import type { ClientEvent } from "./types.js";
import { WindowManager } from "./window-manager.js";
import "./libs/claude-settings.js";
import { existsSync } from "fs";

// Track polling interval for cleanup
let pollingIntervalId: ReturnType<typeof setInterval> | null = null;

const windowManager = WindowManager.getInstance();

// Single instance lock - previene múltiples ventanas
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
    process.exit(0);
} else {
    // Manejar segunda instancia - enfocar ventana existente
    app.on("second-instance", () => {
        windowManager.focus();
    });
}

app.on("ready", async () => {
    try {
        // Validate resources exist
        if (!existsSync(getPreloadPath())) {
            throw new Error(`Preload script not found`);
        }

        await windowManager.initialize();

        // Initialize orchestrator and IPC handlers
        initializeHandlers();

        const win = windowManager.getMainWindow();
        if (!win) {
            throw new Error("Failed to create main window");
        }

        pollingIntervalId = pollResources(win);

        // IPC handlers
        ipcMainHandle("getStaticData", () => {
            return getStaticData();
        });

        ipcMain.on("client-event", (_event: Electron.IpcMainEvent, event: ClientEvent) => {
            handleClientEvent(event);
        });

        ipcMainHandle("generate-session-title", async (_: Electron.IpcMainInvokeEvent, userInput: string | null) => {
            return await generateSessionTitle(userInput);
        });

        ipcMainHandle("get-recent-cwds", (_: Electron.IpcMainInvokeEvent, limit?: number) => {
            const boundedLimit = limit ? Math.min(Math.max(limit, 1), 20) : 8;
            return sessions.listRecentCwds(boundedLimit);
        });

        ipcMainHandle("select-directory", async () => {
            const result = await dialog.showOpenDialog(win, {
                properties: ['openDirectory']
            });

            if (result.canceled) {
                return null;
            }

            return result.filePaths[0];
        });

        // Window lifecycle handlers
        win.on("closed", () => {
            cleanupPolling(pollingIntervalId);
            pollingIntervalId = null;
        });

        console.log('App ready');
    } catch (error) {
        console.error("Failed to initialize app:", error);
        dialog.showErrorBox(
            "Initialization Error",
            `Failed to start the application:\n${error instanceof Error ? error.message : String(error)}`
        );
        app.quit();
    }
});

// Window lifecycle - Mac
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        cleanupPolling(pollingIntervalId);
        app.quit();
    }
});

app.on("before-quit", () => {
    cleanupPolling(pollingIntervalId);
});

app.on("activate", () => {
    if (windowManager.isDestroyed()) {
        windowManager.initialize();
    } else {
        windowManager.focus();
    }
});
