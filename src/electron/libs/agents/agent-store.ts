/**
 * Sub Agent 配置存储模块
 * 负责 AI 助手配置的读取、保存、校验逻辑
 */

import { app } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import {
    SubAgentConfig,
    AgentConfigState,
    DEFAULT_AGENT_CONFIG_STATE,
} from "./agent-config.js";
import { getBuiltinAgentTemplates, isBuiltinAgent } from "./builtin-agents.js";

const CONFIG_FILE_NAME = "agents-config.json";

/** 获取配置文件路径 */
function getConfigPath(): string {
    const userDataPath = app.getPath("userData");
    return join(userDataPath, CONFIG_FILE_NAME);
}

/** 验证单个 Sub Agent 配置格式 */
function validateAgentConfig(agent: Partial<SubAgentConfig>): agent is SubAgentConfig {
    return !!(
        agent.id &&
        agent.name &&
        agent.description &&
        agent.prompt &&
        typeof agent.enabled === "boolean" &&
        typeof agent.isBuiltin === "boolean"
    );
}

/** 验证整体配置格式 */
function validateConfigState(config: unknown): config is AgentConfigState {
    if (!config || typeof config !== "object") return false;
    const c = config as AgentConfigState;

    if (typeof c.version !== "number") return false;
    if (!Array.isArray(c.agents)) return false;

    for (const agent of c.agents) {
        if (!validateAgentConfig(agent)) return false;
    }

    return true;
}

/**
 * 补齐内置助手
 * 确保所有内置助手都存在于配置中，保留用户的启用/禁用状态，更新 prompt
 */
function ensureBuiltinAgents(config: AgentConfigState): AgentConfigState {
    const builtinTemplates = getBuiltinAgentTemplates();
    const existingIds = new Set(config.agents.map((a) => a.id));

    // 更新已有的内置助手的 prompt（保留用户的 enabled 状态）
    const updatedAgents = config.agents.map((agent) => {
        if (!agent.isBuiltin) return agent;
        const template = builtinTemplates.find((t) => t.id === agent.id);
        if (!template) return agent;
        return {
            ...agent,
            name: template.name,
            description: template.description,
            prompt: template.prompt,
            updatedAt: new Date().toISOString(),
        };
    });

    // 补充缺失的内置助手
    for (const template of builtinTemplates) {
        if (!existingIds.has(template.id)) {
            updatedAgents.push(template);
        }
    }

    return {
        ...config,
        agents: updatedAgents,
    };
}

/**
 * 加载 Sub Agent 配置
 * @returns 配置对象，如果配置不存在或损坏则返回默认配置（含内置助手）
 */
export function loadAgentConfig(): AgentConfigState {
    try {
        const configPath = getConfigPath();

        if (!existsSync(configPath)) {
            console.info("[agent-store] Config file not found, using default config with builtin agents");
            const defaultConfig = { ...DEFAULT_AGENT_CONFIG_STATE };
            return ensureBuiltinAgents(defaultConfig);
        }

        const raw = readFileSync(configPath, "utf8");
        const config = JSON.parse(raw);

        if (!validateConfigState(config)) {
            console.warn("[agent-store] Invalid config format, using default config");
            const defaultConfig = { ...DEFAULT_AGENT_CONFIG_STATE };
            return ensureBuiltinAgents(defaultConfig);
        }

        // 补齐内置助手（处理版本升级时新增/更新的内置助手）
        const fixedConfig = ensureBuiltinAgents(config);

        console.info(`[agent-store] Loaded agent config with ${fixedConfig.agents.length} agents`);
        return fixedConfig;
    } catch (error) {
        console.error("[agent-store] Failed to load agent config:", error);
        const defaultConfig = { ...DEFAULT_AGENT_CONFIG_STATE };
        return ensureBuiltinAgents(defaultConfig);
    }
}

/**
 * 保存 Sub Agent 配置
 */
export function saveAgentConfig(config: AgentConfigState): void {
    try {
        const configPath = getConfigPath();
        const userDataPath = app.getPath("userData");

        if (!existsSync(userDataPath)) {
            mkdirSync(userDataPath, { recursive: true });
        }

        writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
        console.info("[agent-store] Agent config saved successfully");
    } catch (error) {
        console.error("[agent-store] Failed to save agent config:", error);
        throw error;
    }
}

/**
 * 添加新的 Sub Agent 配置
 */
export function addAgent(config: AgentConfigState, agent: Omit<SubAgentConfig, "id" | "createdAt" | "updatedAt" | "isBuiltin">): AgentConfigState {
    const now = new Date().toISOString();
    const newAgent: SubAgentConfig = {
        ...agent,
        id: generateAgentId(),
        isBuiltin: false,
        createdAt: now,
        updatedAt: now,
    };

    return {
        ...config,
        agents: [...config.agents, newAgent],
    };
}

/**
 * 更新 Sub Agent 配置
 */
export function updateAgent(config: AgentConfigState, agentId: string, updates: Partial<SubAgentConfig>): AgentConfigState {
    return {
        ...config,
        agents: config.agents.map((a) =>
            a.id === agentId
                ? { ...a, ...updates, updatedAt: new Date().toISOString() }
                : a
        ),
    };
}

/**
 * 删除 Sub Agent 配置（仅允许删除自定义助手）
 */
export function removeAgent(config: AgentConfigState, agentId: string): AgentConfigState {
    if (isBuiltinAgent(agentId)) {
        throw new Error("内置助手不可删除");
    }

    return {
        ...config,
        agents: config.agents.filter((a) => a.id !== agentId),
    };
}

/**
 * 启用/禁用 Sub Agent
 */
export function toggleAgent(config: AgentConfigState, agentId: string, enabled: boolean): AgentConfigState {
    return updateAgent(config, agentId, { enabled });
}

/**
 * 获取所有已启用的 Sub Agent
 */
export function getEnabledAgents(config: AgentConfigState): SubAgentConfig[] {
    return config.agents.filter((a) => a.enabled);
}

/**
 * 生成唯一的 Agent ID
 */
export function generateAgentId(): string {
    return `agent-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
