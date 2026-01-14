import { getCurrentApiConfig, buildEnvForConfig } from "./claude-settings.js";
import { unstable_v2_prompt } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { openaiGenerateTitle } from "./openai-adapter.js";
import { app } from "electron";
import { join } from "path";
import { homedir } from "os";

// Get Claude Code CLI path for packaged app
export function getClaudeCodePath(): string | undefined {
  if (app.isPackaged) {
    return join(
      process.resourcesPath,
      'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk/cli.js'
    );
  }
  return undefined;
}

// Build enhanced PATH for packaged environment
export function getEnhancedEnv(): Record<string, string | undefined> {
  const home = homedir();
  const additionalPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${home}/.bun/bin`,
    `${home}/.nvm/versions/node/v20.0.0/bin`,
    `${home}/.nvm/versions/node/v22.0.0/bin`,
    `${home}/.nvm/versions/node/v18.0.0/bin`,
    `${home}/.volta/bin`,
    `${home}/.fnm/aliases/default/bin`,
    '/usr/bin',
    '/bin',
  ];

  const currentPath = process.env.PATH || '';
  const newPath = [...additionalPaths, currentPath].join(':');

  return {
    ...process.env,
    PATH: newPath,
  };
}

export const claudeCodePath = getClaudeCodePath();
export const enhancedEnv = getEnhancedEnv();

// 从用户输入中提取标题的辅助函数
function extractTitleFromInput(userIntent: string): string {
  // 移除换行和多余空格
  const cleaned = userIntent.trim().replace(/\s+/g, ' ');
  // 取前 50 个字符
  const title = cleaned.slice(0, 50);
  // 如果被截断，添加省略号
  return cleaned.length > 50 ? `${title}...` : title;
}

export const generateSessionTitle = async (userIntent: string | null) => {
  if (!userIntent) return "New Session";

  try {
    // 获取当前配置
    const config = getCurrentApiConfig();
    const apiType = config?.apiType || "anthropic";

    // 根据 API 类型选择不同的调用方式
    if (apiType === "openai-compatible" && config) {
      try {
        return await openaiGenerateTitle(config, userIntent);
      } catch (error) {
        console.error("[generateSessionTitle] OpenAI API failed:", error);
        return extractTitleFromInput(userIntent);
      }
    } else {
      // 使用 Anthropic SDK
      const env = buildEnvForConfig(config);
      const model = config?.model || process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
      
      // 合并环境变量
      const mergedEnv = {
        ...enhancedEnv,
        ...env
      };

      const result: SDKResultMessage = await unstable_v2_prompt(
        `please analynis the following user input to generate a short but clearly title to identify this conversation theme:
        ${userIntent}
        directly output the title, do not include any other content`, {
        model,
        env: mergedEnv,
        pathToClaudeCodeExecutable: claudeCodePath,
      });

      if (result.subtype === "success") {
        return result.result;
      }

      // API 调用成功但返回失败状态，使用降级策略
      console.warn("[generateSessionTitle] API returned non-success result:", result);
      return extractTitleFromInput(userIntent);
    }
  } catch (error) {
    // API 调用失败（可能是兼容性问题），使用降级策略
    console.error("[generateSessionTitle] Failed to generate title via API:", error);
    console.info("[generateSessionTitle] Falling back to extracted title from user input");
    return extractTitleFromInput(userIntent);
  }
};
