/**
 * Sub Agent 管理器
 * 单例模式管理 AI 助手配置，提供 SDK 格式转换能力
 */

import { EventEmitter } from "events";
import type { AgentDefinition } from "@anthropic-ai/claude-agent-sdk";
import { AgentConfigState, SubAgentConfig } from "./agent-config.js";
import {
    loadAgentConfig,
    saveAgentConfig,
    addAgent,
    updateAgent,
    removeAgent,
    toggleAgent,
    getEnabledAgents,
} from "./agent-store.js";

export class AgentManager extends EventEmitter {
    private config: AgentConfigState;

    constructor() {
        super();
        this.config = loadAgentConfig();
    }

    /** 获取当前配置 */
    getConfig(): AgentConfigState {
        return this.config;
    }

    /** 获取所有 agent 列表 */
    getAgents(): SubAgentConfig[] {
        return this.config.agents;
    }

    /** 获取所有已启用的 agent */
    getEnabledAgents(): SubAgentConfig[] {
        return getEnabledAgents(this.config);
    }

    /** 添加自定义 agent */
    addAgent(agent: Omit<SubAgentConfig, "id" | "createdAt" | "updatedAt" | "isBuiltin">): SubAgentConfig {
        this.config = addAgent(this.config, agent);
        this.save();
        const newAgent = this.config.agents[this.config.agents.length - 1];
        this.emit("config-changed");
        return newAgent;
    }

    /** 更新 agent */
    updateAgentById(agentId: string, updates: Partial<SubAgentConfig>): void {
        this.config = updateAgent(this.config, agentId, updates);
        this.save();
        this.emit("config-changed");
    }

    /** 删除 agent */
    removeAgent(agentId: string): void {
        this.config = removeAgent(this.config, agentId);
        this.save();
        this.emit("config-changed");
    }

    /** 切换启用/禁用 */
    toggleAgent(agentId: string, enabled: boolean): void {
        this.config = toggleAgent(this.config, agentId, enabled);
        this.save();
        this.emit("config-changed");
    }

    /**
     * 构建 SDK 所需的 agents 配置
     * 将已启用的 SubAgentConfig[] 转换为 Record<string, AgentDefinition>
     */
    buildSDKAgentsConfig(): Record<string, AgentDefinition> | undefined {
        const enabled = this.getEnabledAgents();
        if (enabled.length === 0) return undefined;

        const result: Record<string, AgentDefinition> = {};
        for (const agent of enabled) {
            result[agent.name] = {
                description: agent.description,
                prompt: agent.prompt,
                model: agent.model === "inherit" ? undefined : (agent.model as AgentDefinition["model"]),
            };
        }
        return result;
    }

    /** 持久化配置 */
    private save(): void {
        saveAgentConfig(this.config);
    }
}

/** 单例实例 */
let agentManagerInstance: AgentManager | null = null;

/** 获取 AgentManager 单例 */
export function getAgentManager(): AgentManager {
    if (!agentManagerInstance) {
        agentManagerInstance = new AgentManager();
    }
    return agentManagerInstance;
}
