import { claudeCodeEnv } from "./claude-settings.js";
import { unstable_v2_prompt } from "@anthropic-ai/claude-agent-sdk";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { app } from "electron";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";

// SEC-007: Dynamic SDK path resolution
// Tries multiple possible locations based on the runtime environment

/**
 * Resolve the Claude SDK executable path dynamically
 * Tries multiple possible locations based on the runtime environment
 *
 * @returns The resolved path to the Claude SDK executable, or undefined if not found
 */
export function getClaudeCodePath(): string | undefined {
  if (app.isPackaged) {
    // Production: In packaged app
    const packagedPath = join(
      process.resourcesPath,
      'app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk/cli.js'
    );
    if (existsSync(packagedPath)) {
      return packagedPath;
    }
  }

  // Development: In source tree
  const devPath = join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
  if (existsSync(devPath)) {
    return devPath;
  }

  // Bun global install
  const bunPath = join(homedir(), '.bun', 'packages', 'global-node_modules',
      '@anthropic-ai', 'claude-agent-sdk', 'cli.js');
  if (existsSync(bunPath)) {
    return bunPath;
  }

  return undefined;
}

// ARCH-006: Dynamic node version manager paths
// Reads from environment and validates paths exist

interface NodeManagerConfig {
  name: string;
  envVar: string;
  pathPattern: string;
}

/**
 * Get additional PATH entries from node version managers
 * Only includes paths that actually exist
 */
function getNodeManagerPaths(): string[] {
  const home = homedir();
  const managers: NodeManagerConfig[] = [
    {
      name: "nvm",
      envVar: "NVM_DIR",
      pathPattern: `${home}/.nvm/versions/node/v{version}/bin`
    },
    {
      name: "volta",
      envVar: "VOLTA_HOME",
      pathPattern: `${home}/.volta/bin`
    },
    {
      name: "fnm",
      envVar: "FNM_DIR",
      pathPattern: `${home}/.fnm/aliases/default/bin`
    },
    {
      name: "asdf",
      envVar: "ASDF_DIR",
      pathPattern: `${home}/.asdf/shims`
    }
  ];

  const validPaths: string[] = [];

  for (const manager of managers) {
    const envPath = process.env[manager.envVar];
    if (!envPath) continue;

    // For version-specific managers, try common versions
    if (manager.name === "nvm") {
      const versions = ['v20.0.0', 'v22.0.0', 'v18.0.0', 'v21.0.0'];
      for (const version of versions) {
        const path = manager.pathPattern.replace('{version}', version);
        if (existsSync(path)) {
          validPaths.push(path);
        }
      }
    } else {
      // For version-agnostic managers
      if (existsSync(manager.pathPattern)) {
        validPaths.push(manager.pathPattern);
      }
    }
  }

  return validPaths;
}

/**
 * Build enhanced PATH for packaged environment
 * Includes paths from common node version managers
 * SECURITY: Only includes explicitly allowed environment variables to prevent credential leakage
 */
export function getEnhancedEnv(): Record<string, string | undefined> {
  const home = homedir();

  // Common paths that should always be included
  const commonPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/usr/bin',
    '/bin',
    `${home}/.bun/bin`,
    `${home}/.volta/bin`,
    `${home}/.fnm/aliases/default/bin`,
  ];

  // Get paths from node version managers
  const nodeManagerPaths = getNodeManagerPaths();

  // Combine all paths, removing duplicates
  const allPaths = [...new Set([...commonPaths, ...nodeManagerPaths])];
  const currentPath = process.env.PATH || '';
  const newPath = [...allPaths, currentPath].join(':');

  // SECURITY: Only include explicitly required environment variables
  // This prevents leaking sensitive credentials to the Claude SDK subprocess
  const allowedEnvVars = [
    'PATH',
    'HOME',
    'USER',
    'LANG',
    'LC_ALL',
    'TERM',
    'TERM_PROGRAM',
    'TERM_PROGRAM_VERSION',
    'SHELL',
    'EDITOR',
    'VISUAL',
    'PAGER',
    'TZ',
    'TMPDIR',
  ];

  const env: Record<string, string | undefined> = { PATH: newPath };

  for (const key of allowedEnvVars) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }

  return env;
}

export const claudeCodePath = getClaudeCodePath();
export const enhancedEnv = getEnhancedEnv();

export const generateSessionTitle = async (userIntent: string | null) => {
  if (!userIntent) return "New Session";

  const result: SDKResultMessage = await unstable_v2_prompt(
    `please analyze the following user input to generate a short but clear title to identify this conversation theme:
    ${userIntent}
    directly output the title, do not include any other content`, {
    model: claudeCodeEnv.ANTHROPIC_MODEL,
    env: enhancedEnv,
    pathToClaudeCodeExecutable: claudeCodePath,
  });

  if (result.subtype === "success") {
    return result.result;
  }


  return "New Session";
};
