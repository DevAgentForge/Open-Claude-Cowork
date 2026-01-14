import { app } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";

export type ApiType = "anthropic" | "openai-compatible";

export type ApiConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
  apiType?: ApiType; // 默认为 "anthropic" 以保持向后兼容
};

const CONFIG_FILE_NAME = "api-config.json";

function getConfigPath(): string {
  const userDataPath = app.getPath("userData");
  return join(userDataPath, CONFIG_FILE_NAME);
}

export function loadApiConfig(): ApiConfig | null {
  try {
    const configPath = getConfigPath();
    if (!existsSync(configPath)) {
      return null;
    }
    const raw = readFileSync(configPath, "utf8");
    const config = JSON.parse(raw) as ApiConfig;
    // 验证配置格式
    if (config.apiKey && config.baseURL && config.model) {
      // 设置默认 apiType
      if (!config.apiType) {
        config.apiType = "anthropic";
      }
      return config;
    }
    return null;
  } catch (error) {
    console.error("[config-store] Failed to load API config:", error);
    return null;
  }
}

export function saveApiConfig(config: ApiConfig): void {
  try {
    const configPath = getConfigPath();
    const userDataPath = app.getPath("userData");
    
    // 确保目录存在
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true });
    }
    
    // 验证配置
    if (!config.apiKey || !config.baseURL || !config.model) {
      throw new Error("Invalid config: apiKey, baseURL, and model are required");
    }
    
    // 设置默认 apiType
    if (!config.apiType) {
      config.apiType = "anthropic";
    }
    
    // 保存配置
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    console.info("[config-store] API config saved successfully");
  } catch (error) {
    console.error("[config-store] Failed to save API config:", error);
    throw error;
  }
}

export function deleteApiConfig(): void {
  try {
    const configPath = getConfigPath();
    if (existsSync(configPath)) {
      unlinkSync(configPath);
      console.info("[config-store] API config deleted");
    }
  } catch (error) {
    console.error("[config-store] Failed to delete API config:", error);
  }
}

