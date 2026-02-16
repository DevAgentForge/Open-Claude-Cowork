/**
 * 浏览器进程管理器
 * 管理持久化运行的 Chrome 浏览器进程，供 Playwright MCP 通过 CDP 连接
 * 替代原有的 SSE 模式，实现真正的浏览器持久化
 */

import { spawn, execSync, ChildProcess } from "child_process";
import { existsSync } from "fs";
import { EventEmitter } from "events";
import { app } from "electron";
import * as path from "path";
import type { MCPBrowserMode } from "./mcp-config.js";

/** 浏览器进程状态 */
export type BrowserProcessStatus = "stopped" | "starting" | "running" | "error";

/** 浏览器进程管理器配置 */
export interface BrowserProcessConfig {
    /** CDP 调试端口 */
    debugPort: number;
    /** 浏览器运行模式 */
    browserMode: MCPBrowserMode;
    /** 用户数据目录（用于持久化 cookies/登录态） */
    userDataDir?: string;
}

/** 默认配置 */
const DEFAULT_CONFIG: BrowserProcessConfig = {
    debugPort: 9222,
    browserMode: "visible",
};

/** 常量 */
const HEALTH_CHECK_TIMEOUT_MS = 15000;
const HEALTH_CHECK_INTERVAL_MS = 500;
const SHUTDOWN_TIMEOUT_MS = 5000;
const MAX_LOGS = 100;

/**
 * 浏览器进程管理器
 * 单例模式，确保只有一个持久化的 Chrome 浏览器实例
 */
export class BrowserProcessManager extends EventEmitter {
    private static instance: BrowserProcessManager | null = null;

    private browserProcess: ChildProcess | null = null;
    private config: BrowserProcessConfig = DEFAULT_CONFIG;
    private status: BrowserProcessStatus = "stopped";
    private errorMessage?: string;
    private logs: string[] = [];

    private constructor() {
        super();
    }

    /** 获取单例实例 */
    public static getInstance(): BrowserProcessManager {
        if (!BrowserProcessManager.instance) {
            BrowserProcessManager.instance = new BrowserProcessManager();
        }
        return BrowserProcessManager.instance;
    }

    /** 获取当前状态 */
    public getStatus(): BrowserProcessStatus {
        return this.status;
    }

    /** 获取 CDP 端点地址 */
    public getCDPEndpoint(): string | undefined {
        if (this.status === "running") {
            return `http://localhost:${this.config.debugPort}`;
        }
        return undefined;
    }

    /** 获取错误信息 */
    public getErrorMessage(): string | undefined {
        return this.errorMessage;
    }

    /** 获取日志 */
    public getLogs(): string[] {
        return [...this.logs];
    }

    /** 是否正在运行 */
    public isRunning(): boolean {
        return this.status === "running";
    }

    /** 更新状态 */
    private setStatus(status: BrowserProcessStatus, error?: string): void {
        this.status = status;
        this.errorMessage = error;
        this.emit("status-change", status, error);
    }

    /** 添加日志 */
    private addLog(message: string): void {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}`;
        this.logs.push(logEntry);
        if (this.logs.length > MAX_LOGS) {
            this.logs.shift();
        }
        this.emit("log", logEntry);
        console.log(`[BrowserProcess] ${message}`);
    }

    /**
     * 检查指定端口是否已有 Chrome CDP 服务
     */
    private async checkCDPAvailable(): Promise<boolean> {
        try {
            const response = await fetch(
                `http://localhost:${this.config.debugPort}/json/version`,
                { signal: AbortSignal.timeout(2000) }
            );
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * 查找系统中的 Chrome/Chromium 可执行文件路径
     */
    private findChromePath(): string | null {
        const platform = process.platform;

        const candidates: string[] = [];

        if (platform === "darwin") {
            candidates.push(
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
                "/Applications/Chromium.app/Contents/MacOS/Chromium",
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            );
        } else if (platform === "win32") {
            const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
            const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
            const localAppData = process.env["LOCALAPPDATA"] || "";
            candidates.push(
                path.join(programFiles, "Google\\Chrome\\Application\\chrome.exe"),
                path.join(programFilesX86, "Google\\Chrome\\Application\\chrome.exe"),
                path.join(localAppData, "Google\\Chrome\\Application\\chrome.exe"),
                path.join(programFiles, "Microsoft\\Edge\\Application\\msedge.exe"),
            );
        } else {
            // Linux
            candidates.push(
                "google-chrome",
                "google-chrome-stable",
                "chromium-browser",
                "chromium",
            );
        }

        for (const candidate of candidates) {
            // Linux 命令名需要通过 which 检查
            if (platform === "linux" && !candidate.includes("/")) {
                try {
                    execSync(`which ${candidate}`, { stdio: "ignore" });
                    return candidate;
                } catch {
                    continue;
                }
            }
            if (existsSync(candidate)) {
                return candidate;
            }
        }

        return null;
    }

    /**
     * 获取默认的浏览器用户数据目录
     */
    public getDefaultUserDataDir(): string {
        return path.join(app.getPath("userData"), "chrome-cdp-data");
    }

    /**
     * 启动 Chrome 浏览器进程
     * @param config 配置选项
     * @returns CDP 端点地址
     */
    public async start(config?: Partial<BrowserProcessConfig>): Promise<string> {
        // 如果已经在运行，直接返回端点
        if (this.isRunning()) {
            const endpoint = this.getCDPEndpoint()!;
            this.addLog("Browser already running");
            return endpoint;
        }

        // 合并配置
        if (config) {
            this.config = { ...this.config, ...config };
        }

        // 先检查端口上是否已有 CDP 服务（用户可能手动启动了浏览器）
        if (await this.checkCDPAvailable()) {
            this.addLog(`CDP service already available on port ${this.config.debugPort}`);
            this.setStatus("running");
            return this.getCDPEndpoint()!;
        }

        this.setStatus("starting");
        this.addLog(`Starting Chrome browser on debug port ${this.config.debugPort}...`);

        const chromePath = this.findChromePath();
        if (!chromePath) {
            const errorMsg = "未找到 Chrome/Chromium 浏览器，请确保已安装 Google Chrome";
            this.setStatus("error", errorMsg);
            throw new Error(errorMsg);
        }

        this.addLog(`Found Chrome at: ${chromePath}`);

        // 构建启动参数
        const args = this.buildChromeArgs();
        this.addLog(`Launch args: ${args.join(" ")}`);

        try {
            this.browserProcess = spawn(chromePath, args, {
                stdio: ["ignore", "pipe", "pipe"],
                detached: false,
            });

            // 监听 stdout/stderr 日志
            this.browserProcess.stdout?.on("data", (data) => {
                this.addLog(`stdout: ${data.toString().trim()}`);
            });

            this.browserProcess.stderr?.on("data", (data) => {
                this.addLog(`stderr: ${data.toString().trim()}`);
            });

            // 监听进程错误
            this.browserProcess.on("error", (err) => {
                this.addLog(`Process error: ${err.message}`);
                this.setStatus("error", err.message);
                this.browserProcess = null;
            });

            // 监听进程退出
            this.browserProcess.on("exit", (code, signal) => {
                this.addLog(`Process exited with code ${code}, signal ${signal}`);
                if (this.status === "running") {
                    this.setStatus("error", `Browser exited unexpectedly (code: ${code})`);
                }
                this.browserProcess = null;
            });

            // 等待 CDP 端点可用
            await this.waitForCDP();

            this.setStatus("running");
            const endpoint = this.getCDPEndpoint()!;
            this.addLog(`Browser ready, CDP endpoint: ${endpoint}`);
            return endpoint;

        } catch (error: any) {
            this.addLog(`Failed to start browser: ${error.message}`);
            this.setStatus("error", error.message);
            // 清理可能启动的进程
            if (this.browserProcess) {
                this.browserProcess.kill("SIGKILL");
                this.browserProcess = null;
            }
            throw error;
        }
    }

    /**
     * 构建 Chrome 启动参数
     */
    private buildChromeArgs(): string[] {
        const args: string[] = [
            `--remote-debugging-port=${this.config.debugPort}`,
            "--no-first-run",
            "--no-default-browser-check",
        ];

        // 用户数据目录
        const userDataDir = this.config.userDataDir || this.getDefaultUserDataDir();
        args.push(`--user-data-dir=${userDataDir}`);

        // headless 模式
        if (this.config.browserMode === "headless") {
            args.push("--headless=new");
        }

        return args;
    }

    /**
     * 等待 CDP 端点可用
     */
    private async waitForCDP(): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < HEALTH_CHECK_TIMEOUT_MS) {
            if (await this.checkCDPAvailable()) {
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS));
        }

        throw new Error(`CDP endpoint not available after ${HEALTH_CHECK_TIMEOUT_MS}ms`);
    }

    /**
     * 停止浏览器进程
     */
    public async stop(): Promise<void> {
        if (!this.browserProcess) {
            this.addLog("Browser not running (no managed process)");
            this.setStatus("stopped");
            return;
        }

        this.addLog("Stopping browser...");

        return new Promise((resolve) => {
            if (!this.browserProcess) {
                this.setStatus("stopped");
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                if (this.browserProcess) {
                    this.addLog("Force killing browser...");
                    this.browserProcess.kill("SIGKILL");
                }
            }, SHUTDOWN_TIMEOUT_MS);

            this.browserProcess.once("exit", () => {
                clearTimeout(timeout);
                this.browserProcess = null;
                this.setStatus("stopped");
                this.addLog("Browser stopped");
                resolve();
            });

            this.browserProcess.kill("SIGTERM");
        });
    }

    /**
     * 重启浏览器
     */
    public async restart(config?: Partial<BrowserProcessConfig>): Promise<string> {
        this.addLog("Restarting browser...");
        await this.stop();
        return this.start(config);
    }

    /**
     * 获取当前配置
     */
    public getConfig(): BrowserProcessConfig {
        return { ...this.config };
    }

    /**
     * 清理资源（应用退出时调用）
     */
    public async cleanup(): Promise<void> {
        await this.stop();
        BrowserProcessManager.instance = null;
    }
}

/** 获取 BrowserProcessManager 单例 */
export function getBrowserProcessManager(): BrowserProcessManager {
    return BrowserProcessManager.getInstance();
}
