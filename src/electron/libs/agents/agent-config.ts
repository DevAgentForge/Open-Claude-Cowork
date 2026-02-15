/**
 * Sub Agent 配置管理核心模块 - 类型定义
 * 用于定义 AI 助手（Sub Agent）配置的 TypeScript 接口
 */

/** 单个 Sub Agent 配置 */
export interface SubAgentConfig {
    /** 唯一标识符 */
    id: string;
    /** 显示名称（同时作为 SDK agent key） */
    name: string;
    /** 简短描述（面向用户的通俗说明） */
    description: string;
    /** 提示词（定义助手的行为和能力） */
    prompt: string;
    /** 是否已启用 */
    enabled: boolean;
    /** 模型选择（'inherit' 表示继承主模型） */
    model: string;
    /** 是否为内置助手 */
    isBuiltin: boolean;
    /** 创建时间 */
    createdAt: string;
    /** 更新时间 */
    updatedAt: string;
}

/** Sub Agent 配置整体状态 */
export interface AgentConfigState {
    /** 配置版本号（用于迁移） */
    version: number;
    /** 所有 Sub Agent 配置列表 */
    agents: SubAgentConfig[];
}

/** 默认配置状态 */
export const DEFAULT_AGENT_CONFIG_STATE: AgentConfigState = {
    version: 1,
    agents: [],
};
