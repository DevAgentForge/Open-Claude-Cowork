import type { ClaudeSettingsEnv } from "../types.js";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { loadApiConfig, type ApiConfig } from "./config-store.js";

const CLAUDE_SETTINGS_ENV_KEYS = [
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_MODEL",
  "API_TIMEOUT_MS",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"
] as const;

export function loadClaudeSettingsEnv(): ClaudeSettingsEnv {
  // 优先使用界面配置
  const uiConfig = loadApiConfig();
  
  // 加载 ~/.claude/settings.json 作为后备
  try {
    const settingsPath = join(homedir(), ".claude", "settings.json");
    const raw = readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as { env?: Record<string, unknown> };
    if (parsed.env) {
      for (const [key, value] of Object.entries(parsed.env)) {
        if (process.env[key] === undefined && value !== undefined && value !== null) {
          process.env[key] = String(value);
        }
      }
    }
  } catch {
    // Ignore missing or invalid settings file.
  }

  const env = {} as ClaudeSettingsEnv;
  for (const key of CLAUDE_SETTINGS_ENV_KEYS) {
    env[key] = process.env[key] ?? "";
  }

  // 如果存在界面配置，覆盖相应字段
  if (uiConfig) {
    env.ANTHROPIC_AUTH_TOKEN = uiConfig.apiKey;
    env.ANTHROPIC_BASE_URL = uiConfig.baseURL;
    env.ANTHROPIC_MODEL = uiConfig.model;
  }

  return env;
}

// 获取当前有效的配置（优先界面配置，回退到文件配置）
export function getCurrentApiConfig(): ApiConfig | null {
  const uiConfig = loadApiConfig();
  if (uiConfig) {
    console.log("[claude-settings] Using UI config:", { 
      baseURL: uiConfig.baseURL, 
      model: uiConfig.model, 
      apiType: uiConfig.apiType 
    });
    return uiConfig;
  }

  // 回退到 ~/.claude/settings.json
  try {
    const settingsPath = join(homedir(), ".claude", "settings.json");
    const raw = readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as { env?: Record<string, unknown> };
    if (parsed.env) {
      const authToken = parsed.env.ANTHROPIC_AUTH_TOKEN;
      const baseURL = parsed.env.ANTHROPIC_BASE_URL;
      const model = parsed.env.ANTHROPIC_MODEL;
      
      if (authToken && baseURL && model) {
        console.log("[claude-settings] Using file config from ~/.claude/settings.json");
        return {
          apiKey: String(authToken),
          baseURL: String(baseURL),
          model: String(model),
          apiType: "anthropic" // 从文件读取的配置默认为 anthropic
        };
      }
    }
  } catch {
    // Ignore missing or invalid settings file.
  }

  console.log("[claude-settings] No config found");
  return null;
}

// 构建环境变量对象，用于传递给 SDK（仅用于 Anthropic API）
export function buildEnvForConfig(config: ApiConfig | null): Record<string, string> {
  const baseEnv = { ...process.env } as Record<string, string>;
  
  // 只对 Anthropic API 类型设置环境变量
  if (config && config.apiType !== "openai-compatible") {
    baseEnv.ANTHROPIC_AUTH_TOKEN = config.apiKey;
    baseEnv.ANTHROPIC_BASE_URL = config.baseURL;
    baseEnv.ANTHROPIC_MODEL = config.model;
  } else if (!config) {
    // 使用默认配置（从 ~/.claude/settings.json）
    const defaultEnv = loadClaudeSettingsEnv();
    baseEnv.ANTHROPIC_AUTH_TOKEN = defaultEnv.ANTHROPIC_AUTH_TOKEN;
    baseEnv.ANTHROPIC_BASE_URL = defaultEnv.ANTHROPIC_BASE_URL;
    baseEnv.ANTHROPIC_MODEL = defaultEnv.ANTHROPIC_MODEL;
  }
  
  return baseEnv;
}

export const claudeCodeEnv = loadClaudeSettingsEnv();
