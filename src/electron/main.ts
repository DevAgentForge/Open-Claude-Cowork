import { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu } from "electron"
import { spawn, ChildProcess, execSync } from "child_process";
import { join } from "path";
import { ipcMainHandle, isDev, DEV_PORT } from "./util.js";
import { getPreloadPath, getUIPath, getIconPath } from "./pathResolver.js";
import { getStaticData, pollResources, stopPolling } from "./test.js";
import { handleClientEvent, cleanupAllSessions } from "./ipc-handlers.js";
import { generateSessionTitle } from "./libs/util.js";
import { saveApiConfig } from "./libs/config-store.js";
import { getCurrentApiConfig, buildEnvForConfig } from "./libs/claude-settings.js";
import type { ClientEvent } from "./types.js";
import "./libs/claude-settings.js";

let cleanupComplete = false;
let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let authToken: string | null = null;

const BACKEND_PORT = 8000;
const BACKEND_HOST = "127.0.0.1";

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

function killBackendProcess(): void {
    if (backendProcess) {
        console.log("[Backend] Killing backend process");
        backendProcess.kill();
        backendProcess = null;
    }
}

async function startBackend(): Promise<string> {
    // Generate auth token for this session
    authToken = crypto.randomUUID();

    // Get the cody backend path
    const codyPath = isDev()
        ? join(app.getAppPath(), "cody")
        : join(process.resourcesPath, "cody");

    console.log(`[Backend] Starting Cody backend from ${codyPath}`);

    // Build environment for the backend
    const config = getCurrentApiConfig();
    const backendEnv: Record<string, string> = {
        ...process.env as Record<string, string>,
        AUTH_TOKEN: authToken,
        HOST: BACKEND_HOST,
        PORT: String(BACKEND_PORT),
    };

    // Pass API config to backend
    if (config) {
        const configEnv = buildEnvForConfig(config);
        Object.assign(backendEnv, configEnv);
    }

    // Spawn the backend process using uv
    backendProcess = spawn("uv", [
        "run",
        "uvicorn",
        "cody.main:app",
        "--host", BACKEND_HOST,
        "--port", String(BACKEND_PORT),
    ], {
        cwd: codyPath,
        env: backendEnv,
        stdio: ["ignore", "pipe", "pipe"],
    });

    backendProcess.stdout?.on("data", (data) => {
        console.log(`[Backend] ${data.toString().trim()}`);
    });

    backendProcess.stderr?.on("data", (data) => {
        console.error(`[Backend] ${data.toString().trim()}`);
    });

    backendProcess.on("error", (error) => {
        console.error("[Backend] Failed to start:", error);
    });

    backendProcess.on("exit", (code) => {
        console.log(`[Backend] Exited with code ${code}`);
        backendProcess = null;
    });

    // Wait for backend to be ready
    await waitForBackend(`http://${BACKEND_HOST}:${BACKEND_PORT}/health`);

    console.log("[Backend] Backend is ready");
    return authToken;
}

async function waitForBackend(url: string, maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch {
            // Backend not ready yet
        }
        await new Promise(r => setTimeout(r, 200));
    }
    throw new Error("Backend failed to start within timeout");
}

function cleanup(): void {
    if (cleanupComplete) return;
    cleanupComplete = true;

    globalShortcut.unregisterAll();
    stopPolling();
    cleanupAllSessions();
    killBackendProcess();
    killViteDevServer();
}

function handleSignal(): void {
    cleanup();
    app.quit();
}

// Initialize everything when app is ready
app.on("ready", async () => {
    Menu.setApplicationMenu(null);
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

    // Start the Cody backend
    try {
        await startBackend();
    } catch (error) {
        console.error("[Backend] Failed to start backend:", error);
        // Continue anyway - legacy IPC handlers will work
    }

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

    if (isDev()) {
        mainWindow.loadURL(`http://localhost:${DEV_PORT}`);
        // Open DevTools in development
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(getUIPath());
    }

    globalShortcut.register('CommandOrControl+Q', () => {
        cleanup();
        app.quit();
    });

    pollResources(mainWindow);

    ipcMainHandle("getStaticData", () => {
        return getStaticData();
    });

    // Handle auth token request (for WebSocket connection)
    ipcMainHandle("get-auth-token", () => {
        return authToken;
    });

    // Handle client events (legacy IPC - kept for compatibility)
    ipcMain.on("client-event", (_: any, event: ClientEvent) => {
        handleClientEvent(event);
    });

    // Handle session title generation
    ipcMainHandle("generate-session-title", async (_: any, userInput: string | null) => {
        return await generateSessionTitle(userInput);
    });

    // Handle recent cwds request - calls Python backend
    ipcMainHandle("get-recent-cwds", async (_: any, limit?: number) => {
        const boundedLimit = limit ? Math.min(Math.max(limit, 1), 20) : 8;
        try {
            const response = await fetch(
                `http://${BACKEND_HOST}:${BACKEND_PORT}/api/recent-cwds?limit=${boundedLimit}`,
                {
                    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
                }
            );
            if (response.ok) {
                const data = await response.json();
                return data.cwds || [];
            }
            return [];
        } catch (error) {
            console.error("Failed to get recent cwds:", error);
            return [];
        }
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

    ipcMainHandle("save-api-config", (_: any, config: any) => {
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
})
