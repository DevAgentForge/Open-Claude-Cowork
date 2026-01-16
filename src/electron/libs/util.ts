import { buildClaudeEnv } from "./claude-settings.js";
import { unstable_v2_prompt } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { app } from "electron";
import { join } from "path";
import { homedir } from "os";

export function getClaudeCodePath(): string | undefined {
  if (app.isPackaged) {
    return join(
      process.resourcesPath,
      'app.asar.unpacked/node_modules/@anthropic-ai/claude-code/cli.js'
    );
  }
  return join(process.cwd(), 'node_modules/@anthropic-ai/claude-code/cli.js');
}

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
  
  const claudeEnv = buildClaudeEnv();

  return {
    ...process.env,
    PATH: newPath,
    ANTHROPIC_AUTH_TOKEN: claudeEnv.ANTHROPIC_AUTH_TOKEN,
    ANTHROPIC_BASE_URL: claudeEnv.ANTHROPIC_BASE_URL || undefined,
    ANTHROPIC_MODEL: claudeEnv.ANTHROPIC_MODEL || undefined,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "true",
  };
}

export const claudeCodePath = getClaudeCodePath();
export const enhancedEnv = getEnhancedEnv();

export const generateSessionTitle = async (userIntent: string | null) => {
  if (!userIntent) return "New Session";
  
  const freshEnv = getEnhancedEnv();

  const result: SDKResultMessage = await unstable_v2_prompt(
    `please analynis the following user input to generate a short but clearly title to identify this conversation theme:
    ${userIntent}
    directly output the title, do not include any other content`, {
    model: buildClaudeEnv().ANTHROPIC_MODEL,
    env: freshEnv,
    pathToClaudeCodeExecutable: claudeCodePath,
  });

  if (result.subtype === "success") {
    return result.result;
  }


  return "New Session";
};
