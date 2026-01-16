import type { LlmProviderConfig } from "../types.js";

export interface DefaultProviderConfig extends LlmProviderConfig {
  isDefault: boolean;
  envOverrides: Record<string, string>;
  description?: string;
}

export const DEFAULT_PROVIDERS: DefaultProviderConfig[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    authToken: "",
    defaultModel: "claude-sonnet-4-20250514",
    models: {
      opus: "claude-opus-4-20250514",
      sonnet: "claude-sonnet-4-20250514",
      haiku: "claude-haiku-4-20250514"
    },
    isDefault: true,
    description: "Official Anthropic API",
    envOverrides: {}
  },
  {
    id: "minimax",
    name: "MiniMax",
    baseUrl: "https://api.minimax.io/anthropic",
    authToken: "",
    defaultModel: "MiniMax-M2.1",
    models: {
      opus: "MiniMax-M2.1",
      sonnet: "MiniMax-M2.1",
      haiku: "MiniMax-M2.1-Lightning"
    },
    isDefault: true,
    description: "Cost-effective alternative with fast inference",
    envOverrides: {
      ANTHROPIC_MODEL: "MiniMax-M2.1",
      API_TIMEOUT_MS: "3000000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      CLAUDE_CODE_MAX_OUTPUT_TOKENS: "64000"
    }
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    authToken: "",
    defaultModel: "anthropic/claude-sonnet-4",
    models: {
      opus: "anthropic/claude-opus-4",
      sonnet: "anthropic/claude-sonnet-4",
      haiku: "anthropic/claude-haiku"
    },
    isDefault: true,
    description: "Multi-provider routing with pay-per-token",
    envOverrides: {}
  },
  {
    id: "glm",
    name: "GLM (ChatGLM)",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    authToken: "",
    defaultModel: "glm-4-plus",
    models: {
      opus: "glm-4-plus",
      sonnet: "glm-4-plus",
      haiku: "glm-4-flash"
    },
    isDefault: true,
    description: "Chinese AI provider with competitive models",
    envOverrides: {}
  },
  {
    id: "bedrock",
    name: "AWS Bedrock",
    baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
    authToken: "",
    defaultModel: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    models: {
      opus: "anthropic.claude-3-opus-20240229-v1:0",
      sonnet: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      haiku: "anthropic.claude-3-haiku-20240307-v1:0"
    },
    isDefault: true,
    description: "Enterprise-grade via AWS infrastructure",
    envOverrides: {}
  }
];

export function getDefaultProviders(): DefaultProviderConfig[] {
  return [...DEFAULT_PROVIDERS];
}

export function getDefaultProvider(id: string): DefaultProviderConfig | undefined {
  return DEFAULT_PROVIDERS.find(p => p.id === id);
}

export function isDefaultProvider(id: string): boolean {
  return DEFAULT_PROVIDERS.some(p => p.id === id);
}

/**
 * Get default providers as SafeProviderConfig for UI display
 * These are templates that users can use to create their own providers
 */
export function getDefaultProviderTemplates(): Array<{
  id: string;
  name: string;
  baseUrl: string;
  defaultModel?: string;
  models?: { opus?: string; sonnet?: string; haiku?: string };
  description?: string;
  isDefault: true;
  hasToken: false;
}> {
  return DEFAULT_PROVIDERS.map(p => ({
    id: `template_${p.id}`,
    name: p.name,
    baseUrl: p.baseUrl,
    defaultModel: p.defaultModel,
    models: p.models,
    description: p.description,
    isDefault: true as const,
    hasToken: false as const
  }));
}
