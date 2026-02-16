/**
 * MCP 配置管理器
 * 负责 MCP Server 配置的管理（启动由 Claude SDK 自动处理）
 */

import { EventEmitter } from "events";
import {
    MCPServerConfig,
    MCPConfigState,
    MCPConfigChangeEvent,
} from "./mcp-config.js";
import { loadMCPConfig, saveMCPConfig, getEnabledServers } from "./mcp-store.js";
import { getBrowserProcessManager, BrowserProcessManager } from "./browser-process-manager.js";
import { PLAYWRIGHT_SERVER_ID, buildPlaywrightArgs } from "./builtin-servers.js";

/** MCP Manager 事件类型 */
export interface MCPManagerEvents {
    "config-changed": (event: MCPConfigChangeEvent) => void;
}

/** SDK MCP Server 配置类型（统一使用 stdio） */
export type SDKMCPServerConfig =
    { type?: 'stdio'; command: string; args?: string[]; env?: Record<string, string> };

/**
 * MCP 配置管理器
 * 单例模式，管理 MCP Server 配置
 * 注意：Server 进程由 Claude SDK 自动启动和管理（stdio 模式）
 * 持久化浏览器通过 CDP 连接到由 BrowserProcessManager 管理的 Chrome 进程
 */
export class MCPManager extends EventEmitter {
    private static instance: MCPManager | null = null;

    /** 当前配置 */
    private config: MCPConfigState;

    /** 浏览器进程管理器实例 */
    private browserManager: BrowserProcessManager;

    private constructor() {
        super();
        this.config = loadMCPConfig();
        this.browserManager = getBrowserProcessManager();
    }

    /** 获取单例实例 */
    public static getInstance(): MCPManager {
        if (!MCPManager.instance) {
            MCPManager.instance = new MCPManager();
        }
        return MCPManager.instance;
    }

    /** 重置实例（主要用于测试） */
    public static resetInstance(): void {
        MCPManager.instance = null;
    }

    /** 获取当前配置 */
    public getConfig(): MCPConfigState {
        return this.config;
    }

    /** 重新加载配置 */
    public reloadConfig(): void {
        this.config = loadMCPConfig();
    }

    /** 保存配置 */
    public saveConfig(): void {
        saveMCPConfig(this.config);
    }

    /** 更新配置 */
    public updateConfig(newConfig: MCPConfigState): void {
        this.config = newConfig;
        this.saveConfig();
    }

    /** 获取已启用的 Servers */
    public getEnabledServers(): MCPServerConfig[] {
        return getEnabledServers(this.config);
    }

    /**
     * 获取 Playwright Server 配置
     */
    public getPlaywrightConfig(): MCPServerConfig | undefined {
        return this.config.servers.find(s => s.id === PLAYWRIGHT_SERVER_ID);
    }

    /**
     * 检查是否需要启动持久化浏览器
     */
    public needsBrowser(): boolean {
        const playwright = this.getPlaywrightConfig();
        return !!playwright?.enabled && !!playwright?.persistBrowser;
    }

    /**
     * 确保持久化浏览器正在运行（如果配置了 persistBrowser）
     * @returns CDP 端点地址或 undefined
     */
    public async ensureBrowserRunning(): Promise<string | undefined> {
        const playwright = this.getPlaywrightConfig();

        if (!playwright?.enabled || !playwright?.persistBrowser) {
            // 如果不需要持久化浏览器，停止可能运行的浏览器进程
            if (this.browserManager.isRunning()) {
                console.log('[mcp-manager] Stopping browser (persistence disabled)');
                await this.browserManager.stop();
            }
            return undefined;
        }

        // 如果已经在运行，直接返回端点
        if (this.browserManager.isRunning()) {
            return this.browserManager.getCDPEndpoint();
        }

        // 启动浏览器
        console.log('[mcp-manager] Starting browser for CDP persistent mode');
        try {
            const endpoint = await this.browserManager.start({
                browserMode: playwright.browserMode || 'visible',
                userDataDir: playwright.userDataDir,
            });
            console.log(`[mcp-manager] Browser started, CDP endpoint: ${endpoint}`);
            return endpoint;
        } catch (error) {
            console.error('[mcp-manager] Failed to start browser:', error);
            throw error;
        }
    }

    /**
     * 停止持久化浏览器
     */
    public async stopBrowser(): Promise<void> {
        if (this.browserManager.isRunning()) {
            console.log('[mcp-manager] Stopping browser');
            await this.browserManager.stop();
        }
    }

    /**
     * 获取浏览器状态
     */
    public getBrowserStatus(): {
        running: boolean;
        endpoint?: string;
        error?: string;
    } {
        return {
            running: this.browserManager.isRunning(),
            endpoint: this.browserManager.getCDPEndpoint(),
            error: this.browserManager.getErrorMessage(),
        };
    }

    /**
     * 构建用于 Claude SDK 的 MCP Servers 配置
     * 返回格式符合 SDK 的 mcpServers 选项
     * 如果 Playwright 配置了持久化浏览器，将使用 CDP 模式（stdio + --cdp-endpoint 参数）
     */
    public buildSDKConfig(): Record<string, SDKMCPServerConfig> {
        const mcpServers: Record<string, SDKMCPServerConfig> = {};

        for (const server of this.config.servers) {
            if (!server.enabled) continue;

            // 检查是否是 Playwright 且配置了持久化（CDP 模式）
            if (server.id === PLAYWRIGHT_SERVER_ID && server.persistBrowser) {
                const cdpEndpoint = this.browserManager.getCDPEndpoint();
                if (cdpEndpoint) {
                    // 使用 stdio 模式 + --cdp-endpoint 参数连接到持久化浏览器
                    mcpServers[server.id] = {
                        type: 'stdio',
                        command: server.command,
                        args: buildPlaywrightArgs(server.browserMode, undefined, cdpEndpoint),
                    };
                    console.log(`[mcp-manager] Configured server: ${server.id} (CDP mode at ${cdpEndpoint})`);
                } else {
                    console.log(`[mcp-manager] Skipping server ${server.id}: browser not running`);
                }
                continue;
            }

            // 标准 stdio 模式
            if (server.transportType !== 'stdio') {
                console.log(`[mcp-manager] Skipping server ${server.id}: unsupported transport type ${server.transportType}`);
                continue;
            }

            mcpServers[server.id] = {
                type: 'stdio',
                command: server.command,
                args: server.args,
                env: server.env,
            };

            console.log(`[mcp-manager] Configured server: ${server.id} (${server.name}) - stdio mode`);
        }

        return mcpServers;
    }

    /**
     * 构建用于 Claude SDK 的 MCP Servers 配置（异步版本）
     * 会自动启动持久化浏览器（如果需要）
     */
    public async buildSDKConfigAsync(): Promise<Record<string, SDKMCPServerConfig>> {
        // 先确保浏览器运行（如果需要）
        await this.ensureBrowserRunning();

        // 然后构建配置
        return this.buildSDKConfig();
    }

    /**
     * 清理所有资源（应用退出时调用）
     */
    public async cleanup(): Promise<void> {
        await this.browserManager.cleanup();
    }
}

/** 导出单例获取函数 */
export function getMCPManager(): MCPManager {
    return MCPManager.getInstance();
}
