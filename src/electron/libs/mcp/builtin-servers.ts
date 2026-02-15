/**
 * 内置 MCP Server 配置模板
 * 提供预配置的 MCP Server，如 Playwright 浏览器工具
 */

import { app } from "electron";
import * as path from "path";
import { MCPServerConfig, MCPBrowserMode } from "./mcp-config.js";

/** 内置 Server 类型 */
export type BuiltinServerType = "playwright";

/** Playwright MCP Server ID（固定） */
export const PLAYWRIGHT_SERVER_ID = "builtin-playwright";

/**
 * 获取默认的用户数据目录
 * 用于持久化浏览器会话（cookies、登录状态等）
 */
export function getDefaultUserDataDir(): string {
    return path.join(app.getPath("userData"), "playwright-data");
}

/**
 * 构建 Playwright MCP Server 的命令参数
 * @param browserMode 浏览器运行模式
 * @param userDataDir 用户数据目录（可选）
 * @param cdpEndpoint CDP 端点地址（可选，启用后通过 CDP 连接已有浏览器）
 */
export function buildPlaywrightArgs(
    browserMode: MCPBrowserMode = "visible",
    userDataDir?: string,
    cdpEndpoint?: string
): string[] {
    // 基础参数：使用 -y 自动确认下载
    const args: string[] = ["-y", "@playwright/mcp@latest"];

    // CDP 模式：连接到已有浏览器，不需要 headless 和 userDataDir 参数
    if (cdpEndpoint) {
        args.push(`--cdp-endpoint=${cdpEndpoint}`);
        return args;
    }

    // headless 模式
    if (browserMode === "headless") {
        args.push("--headless");
    }

    // 用户数据目录（用于持久化会话）
    if (userDataDir) {
        args.push("--user-data-dir", userDataDir);
    }

    return args;
}

/**
 * 创建 Playwright MCP Server 配置
 * @param browserMode 浏览器运行模式
 * @param userDataDir 用户数据目录（留空则不持久化）
 * @param persistBrowser 是否跨对话保持浏览器（CDP 模式）
 * @param cdpEndpoint CDP 端点地址（persistBrowser 时使用）
 */
export function createPlaywrightServerConfig(
    browserMode: MCPBrowserMode = "visible",
    userDataDir?: string,
    persistBrowser: boolean = false,
    cdpEndpoint?: string
): MCPServerConfig {
    const now = new Date().toISOString();

    return {
        id: PLAYWRIGHT_SERVER_ID,
        name: "浏览器自动化",
        description: "通过 Playwright 控制浏览器，支持网页操作、信息采集、自动填表等任务",
        command: "npx",
        args: buildPlaywrightArgs(browserMode, userDataDir, cdpEndpoint),
        transportType: "stdio",
        enabled: false,
        isBuiltin: true,
        builtinType: "playwright",
        browserMode,
        userDataDir,
        persistBrowser,
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * 获取所有内置 Server 配置模板
 */
export function getBuiltinServerTemplates(): MCPServerConfig[] {
    return [
        createPlaywrightServerConfig("visible"),
    ];
}

/**
 * 检查是否为内置 Server
 */
export function isBuiltinServer(serverId: string): boolean {
    return serverId === PLAYWRIGHT_SERVER_ID;
}

/**
 * 更新 Playwright Server 的配置
 * @param config 现有配置
 * @param browserMode 新的浏览器模式
 * @param userDataDir 新的用户数据目录（undefined 表示不修改，null 表示清除）
 * @param persistBrowser 是否跨对话保持浏览器（undefined 表示不修改）
 * @param cdpEndpoint CDP 端点地址（persistBrowser 时传入）
 */
export function updatePlaywrightConfig(
    config: MCPServerConfig,
    browserMode: MCPBrowserMode,
    userDataDir?: string | null,
    persistBrowser?: boolean,
    cdpEndpoint?: string
): MCPServerConfig {
    // 如果 userDataDir 是 undefined，保持原值；如果是 null，则清除
    const newUserDataDir = userDataDir === undefined
        ? config.userDataDir
        : (userDataDir ?? undefined);

    // 如果 persistBrowser 是 undefined，保持原值
    const newPersistBrowser = persistBrowser === undefined
        ? config.persistBrowser
        : persistBrowser;

    // CDP 模式下不需要 userDataDir 和 browserMode 传给 Playwright（由浏览器本身管理）
    const effectiveCdpEndpoint = newPersistBrowser ? cdpEndpoint : undefined;

    return {
        ...config,
        args: buildPlaywrightArgs(browserMode, newUserDataDir, effectiveCdpEndpoint),
        browserMode,
        userDataDir: newUserDataDir,
        persistBrowser: newPersistBrowser,
        updatedAt: new Date().toISOString(),
    };
}



/**
 * 执行命令并检查是否可用
 */
async function checkCommandAvailable(command: string): Promise<{ stdout?: string; error?: Error }> {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    try {
        const result = await execAsync(command);
        return { stdout: result.stdout };
    } catch (error) {
        return { error: error as Error };
    }
}

/**
 * 检测 Node.js 环境是否可用
 */
export async function checkNodeEnvironment(): Promise<{
    available: boolean;
    version?: string;
    error?: string;
}> {
    const result = await checkCommandAvailable("node --version");

    if (result.error) {
        console.error("[builtin-servers] Node.js check failed:", result.error.message);
        return {
            available: false,
            error: "Node.js 环境未检测到。请确保已安装 Node.js 并添加到系统 PATH 中。",
        };
    }

    return { available: true, version: result.stdout?.trim() };
}

/**
 * 检测 npx 命令是否可用
 */
export async function checkNpxAvailable(): Promise<{
    available: boolean;
    error?: string;
}> {
    const result = await checkCommandAvailable("npx --version");

    if (result.error) {
        console.error("[builtin-servers] npx check failed:", result.error.message);
        return {
            available: false,
            error: "npx 命令不可用。请确保已安装 npm 并添加到系统 PATH 中。",
        };
    }

    return { available: true };
}

/**
 * 预检查 Playwright MCP Server 的运行环境
 */
export async function preflightPlaywrightCheck(): Promise<{
    ready: boolean;
    issues: string[];
    suggestions: string[];
}> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // 检查 Node.js
    const nodeCheck = await checkNodeEnvironment();
    if (!nodeCheck.available) {
        issues.push("Node.js 未安装");
        suggestions.push("请访问 https://nodejs.org 下载并安装 Node.js");
    }

    // 检查 npx
    const npxCheck = await checkNpxAvailable();
    if (!npxCheck.available) {
        issues.push("npx 命令不可用");
        suggestions.push("请确保 npm 已正确安装");
    }

    return {
        ready: issues.length === 0,
        issues,
        suggestions,
    };
}
