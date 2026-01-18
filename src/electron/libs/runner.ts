import { query, type SDKMessage, type PermissionResult, type SettingSource, type AgentDefinition, type SdkPluginConfig } from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent, PermissionMode } from "../types.js";
import type { Session } from "./session-store.js";
import { claudeCodePath, enhancedEnv } from "./util.js";
import { settingsManager } from "./settings-manager.js";
import { existsSync, realpathSync } from "fs";
import { join, relative, sep } from "path";
import { homedir } from "os";

/**
 * Configuration for pending permissions management
 * Prevents memory leaks from unbounded Map growth
 */
interface PendingPermissionsConfig {
  /** Maximum number of pending permissions before forcing cleanup */
  maxPendingPermissions: number;
  /** Timeout for permission requests in milliseconds */
  permissionTimeoutMs: number;
  /** Interval for periodic cleanup of stale entries */
  cleanupIntervalMs: number;
  /** Age threshold for considering an entry stale */
  staleThresholdMs: number;
}

const DEFAULT_PENDING_PERMISSIONS_CONFIG: PendingPermissionsConfig = {
  maxPendingPermissions: 100,
  permissionTimeoutMs: 5 * 60 * 1000, // 5 minutes
  cleanupIntervalMs: 60 * 1000, // 1 minute
  staleThresholdMs: 10 * 60 * 1000 // 10 minutes
};

/**
 * Entry for tracking pending permission requests
 * @internal
 */
interface PendingPermissionEntry {
  toolUseId: string;
  toolName: string;
  input: unknown;
  resolve: (result: PermissionResult) => void;
  createdAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

export type RunnerOptions = {
  prompt: string;
  session: Session;
  resumeSessionId?: string;
  onEvent: (event: ServerEvent) => void;
  onSessionUpdate?: (updates: Partial<Session>) => void;
  // SECURITY: providerEnv contains pre-decrypted env vars (including token)
  // This is set by ipc-handlers.ts in the main process - tokens never leave main
  providerEnv?: Record<string, string> | null;
};

export type RunnerHandle = {
  abort: () => void;
};

const DEFAULT_CWD = process.cwd();

/**
 * Get setting sources for loading ~/.claude/ configuration
 * This enables agents, skills, hooks, and plugins from user settings
 */
function getSettingSources(): SettingSource[] {
  return ["user", "project", "local"];
}

/**
 * Get custom agents from settings manager
 * Converts activeSkills to AgentDefinition format for SDK
 */
function getCustomAgents(): Record<string, AgentDefinition> {
  const agents: Record<string, AgentDefinition> = {};
  const skills = settingsManager.getActiveSkills();

  for (const skill of skills) {
    // Only convert skill-type entries (not slash commands)
    if (skill.type === "skill") {
      agents[skill.name] = {
        description: `Custom skill: ${skill.name}`,
        prompt: `You are executing the ${skill.name} skill. Follow the skill's instructions precisely.`,
        model: "sonnet"
      };
    }
  }

  return agents;
}

/**
 * Get local plugins from ~/.claude/plugins/ directory
 * SECURITY: Validates paths to prevent path traversal attacks (CWE-22)
 */
function getLocalPlugins(): SdkPluginConfig[] {
  const plugins: SdkPluginConfig[] = [];
  const pluginsDir = join(homedir(), ".claude", "plugins");

  if (existsSync(pluginsDir)) {
    // The SDK will scan this directory automatically when settingSources includes 'user'
    // We can add explicit plugin paths here if needed
    console.log(`[Runner] Plugins directory exists: ${pluginsDir}`);
  }

  // Get enabled plugins from settings
  const enabledPlugins = settingsManager.getEnabledPlugins();
  for (const [name, config] of enabledPlugins) {
    if (config.enabled) {
      const pluginPath = join(pluginsDir, name);
      // SECURITY: Validate path is within pluginsDir to prevent path traversal (CWE-22)
      // Use realpathSync + relative to prevent symlink/prefix bypass
      if (existsSync(pluginPath)) {
        let resolvedPluginPath: string;
        let resolvedPluginsDir: string;
        try {
          resolvedPluginPath = realpathSync(pluginPath);
          resolvedPluginsDir = realpathSync(pluginsDir);
        } catch {
          // If realpath fails, skip this plugin
          continue;
        }
        const relPath = relative(resolvedPluginsDir, resolvedPluginPath);
        const isInsideDir =
          !relPath.startsWith(".." + sep) && relPath !== "..";
        if (isInsideDir) {
          plugins.push({ type: "local", path: pluginPath });
          console.log(`[Runner] Adding plugin: ${name}`);
        }
      }
    }
  }

  return plugins;
}

/**
 * Parse comma-separated list of allowed tools into a Set
 * Returns null if no restrictions (all tools allowed)
 */
export function parseAllowedTools(allowedTools?: string): Set<string> | null {
  if (allowedTools === undefined || allowedTools === null || allowedTools.trim() === "") {
    return null;
  }
  const items = allowedTools
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean)
    .map((tool) => tool.toLowerCase());
  return new Set(items);
}

/**
 * Check if a tool is allowed based on allowedTools configuration
 * AskUserQuestion is always allowed
 */
export function isToolAllowed(toolName: string, allowedTools: Set<string> | null): boolean {
  // AskUserQuestion is always allowed
  if (toolName === "AskUserQuestion") return true;
  // If no restrictions, all tools are allowed
  if (!allowedTools) return true;
  // Check if tool is in the allowed set
  return allowedTools.has(toolName.toLowerCase());
}

type PermissionRequestContext = {
  session: Session;
  sendPermissionRequest: (toolUseId: string, toolName: string, input: unknown) => void;
  permissionMode: PermissionMode;
  allowedTools: Set<string> | null;
};

/**
 * Create a canUseTool function with memory leak prevention
 * - Limits maximum pending permissions
 * - Periodic cleanup of stale entries
 * - Proper cleanup on all exit paths
 */
export function createCanUseTool(
  context: PermissionRequestContext,
  config: Partial<PendingPermissionsConfig> = {}
): (toolName: string, input: unknown, options: { signal: AbortSignal }) => Promise<PermissionResult> {
  const { session, sendPermissionRequest, permissionMode, allowedTools } = context;
  const fullConfig = { ...DEFAULT_PENDING_PERMISSIONS_CONFIG, ...config };

  // Track cleanup interval for periodic maintenance
  let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Cleanup a single permission entry
   */
  function cleanupEntry(toolUseId: string, entry: PendingPermissionEntry | undefined): void {
    if (entry) {
      clearTimeout(entry.timeoutId);
      session.pendingPermissions.delete(toolUseId);
    }
  }

  /**
   * Periodic cleanup of stale entries
   */
  function startPeriodicCleanup(): void {
    if (cleanupIntervalId) return; // Already running

    cleanupIntervalId = setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [toolUseId, entry] of session.pendingPermissions) {
        // Type guard for entry with createdAt
        if ("createdAt" in Object(entry) && typeof (entry as PendingPermissionEntry).createdAt === "number") {
          const entryTyped = entry as PendingPermissionEntry;
          if (entryTyped.createdAt < now - fullConfig.staleThresholdMs) {
            // Entry is stale - cleanup
            console.warn(
              `[Runner] Cleaning up stale permission request: ${entryTyped.toolName} (${toolUseId})`
            );
            cleanupEntry(toolUseId, entryTyped);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`[Runner] Cleaned up ${cleanedCount} stale permission entries`);
      }
    }, fullConfig.cleanupIntervalMs);
  }

  // Start periodic cleanup when first permission is requested
  let cleanupStarted = false;

  return async (toolName: string, input: unknown, { signal }: { signal: AbortSignal }) => {
    // Start periodic cleanup on first use
    if (!cleanupStarted) {
      startPeriodicCleanup();
      cleanupStarted = true;
    }

    const isAskUserQuestion = toolName === "AskUserQuestion";

    // FREE mode: auto-approve all tools except AskUserQuestion
    if (!isAskUserQuestion && permissionMode === "free") {
      // Still check allowedTools even in free mode
      if (!isToolAllowed(toolName, allowedTools)) {
        return {
          behavior: "deny",
          message: `Tool ${toolName} is not allowed by allowedTools restriction`
        } as PermissionResult;
      }
      return { behavior: "allow", updatedInput: input } as PermissionResult;
    }

    // SECURE mode: check allowedTools and require user approval
    if (!isToolAllowed(toolName, allowedTools)) {
      return {
        behavior: "deny",
        message: `Tool ${toolName} is not allowed by allowedTools restriction`
      } as PermissionResult;
    }

    // Check if we're exceeding the maximum pending permissions limit
    if (session.pendingPermissions.size >= fullConfig.maxPendingPermissions) {
      // First, try to cleanup stale entries
      const now = Date.now();
      for (const [toolUseId, entry] of session.pendingPermissions) {
        if ("createdAt" in Object(entry) && typeof (entry as PendingPermissionEntry).createdAt === "number") {
          const entryTyped = entry as PendingPermissionEntry;
          if (entryTyped.createdAt < now - fullConfig.staleThresholdMs) {
            cleanupEntry(toolUseId, entryTyped);
          }
        }
      }

      // If still at limit, deny new request
      if (session.pendingPermissions.size >= fullConfig.maxPendingPermissions) {
        console.warn(
          `[Runner] Too many pending permission requests (${session.pendingPermissions.size}), denying new request`
        );
        return {
          behavior: "deny",
          message: `Too many pending permission requests (max: ${fullConfig.maxPendingPermissions})`
        } as PermissionResult;
      }
    }

    // Request user permission
    const toolUseId = crypto.randomUUID();
    const createdAt = Date.now();

    sendPermissionRequest(toolUseId, toolName, input);

    return new Promise<PermissionResult>((resolve) => {
      // Create entry with tracking
      const entry: PendingPermissionEntry = {
        toolUseId,
        toolName,
        input,
        createdAt,
        resolve: (result: PermissionResult) => {
          cleanupEntry(toolUseId, entry);
          resolve(result);
        }
      };

      // Set timeout to prevent indefinite waiting
      const timeoutId = setTimeout(() => {
        console.warn(
          `[Runner] Permission request timed out for tool ${toolName} (${toolUseId})`
        );
        cleanupEntry(toolUseId, entry);
        resolve({ behavior: "deny", message: "Permission request timed out after 5 minutes" });
      }, fullConfig.permissionTimeoutMs);

      entry.timeoutId = timeoutId;
      session.pendingPermissions.set(toolUseId, entry);

      // Handle abort signal
      const abortHandler = () => {
        signal.removeEventListener("abort", abortHandler);
        cleanupEntry(toolUseId, entry);
        resolve({ behavior: "deny", message: "Session aborted" });
      };

      signal.addEventListener("abort", abortHandler);
    });
  };
}

export async function runClaude(options: RunnerOptions): Promise<RunnerHandle> {
  const { prompt, session, resumeSessionId, onEvent, onSessionUpdate, providerEnv } = options;
  const abortController = new AbortController();

  // Get permission mode from session (default to "secure" for backward compatibility)
  const permissionMode: PermissionMode = session.permissionMode ?? "secure";
  const allowedTools = parseAllowedTools(session.allowedTools);

  // SECURITY: providerEnv is already prepared by ipc-handlers with decrypted token
  // Tokens are decrypted on-demand in main process and passed here as env vars
  // Note: Debug logging removed to prevent accidental token exposure
  const customEnv = providerEnv || {};
  console.log(`[Runner] customEnv keys:`, Object.keys(customEnv));

  const sendMessage = (message: SDKMessage) => {
    onEvent({
      type: "stream.message",
      payload: { sessionId: session.id, message }
    });
  };

  const sendPermissionRequest = (toolUseId: string, toolName: string, input: unknown) => {
    onEvent({
      type: "permission.request",
      payload: { sessionId: session.id, toolUseId, toolName, input }
    });
  };

  // Create canUseTool function based on permission configuration
  const canUseTool = createCanUseTool({
    session,
    sendPermissionRequest,
    permissionMode,
    allowedTools
  });

  // Start the query in the background
  (async () => {
    try {
      // Debug: log which model is being used (minimal logging for security)
      const modelUsed = customEnv.ANTHROPIC_MODEL || enhancedEnv.ANTHROPIC_MODEL || "default";
      console.log(`[Runner] Starting session with model: ${modelUsed}`);

      // Get settings for agents, plugins, and hooks
      const settingSources = getSettingSources();
      const customAgents = getCustomAgents();
      const plugins = getLocalPlugins();

      console.log(`[Runner] Loaded ${customAgents.length} custom agents, ${plugins.length} plugins`);

      const q = query({
        prompt,
        options: {
          cwd: session.cwd ?? DEFAULT_CWD,
          resume: resumeSessionId,
          abortController,
          // Merge enhancedEnv with custom provider env (custom overrides enhancedEnv)
          env: { ...enhancedEnv, ...customEnv },
          pathToClaudeCodeExecutable: claudeCodePath,
          includePartialMessages: true,
          // CRITICAL: Load settings from ~/.claude/ (enables agents, skills, hooks, plugins)
          settingSources,
          // Custom agents defined programmatically
          ...(Object.keys(customAgents).length > 0 ? { agents: customAgents } : {}),
          // Local plugins
          ...(plugins.length > 0 ? { plugins } : {}),
          // Only use bypass flags in "free" mode
          ...(permissionMode === "free"
            ? { permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true }
            : {}),
          canUseTool
        }
      });

      // Capture session_id from init message
      for await (const message of q) {
        // Extract session_id from system init message
        if (message.type === "system" && "subtype" in message && message.subtype === "init") {
          const sdkSessionId = message.session_id;
          if (sdkSessionId) {
            session.claudeSessionId = sdkSessionId;
            onSessionUpdate?.({ claudeSessionId: sdkSessionId });
          }
        }

        // Send message to frontend
        sendMessage(message);

        // Check for result to update session status
        if (message.type === "result") {
          const status = message.subtype === "success" ? "completed" : "error";
          onEvent({
            type: "session.status",
            payload: { sessionId: session.id, status, title: session.title }
          });
        }
      }

      // Query completed normally
      if (session.status === "running") {
        onEvent({
          type: "session.status",
          payload: { sessionId: session.id, status: "completed", title: session.title }
        });
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        // Session was aborted, don't treat as error
        return;
      }
      onEvent({
        type: "session.status",
        payload: { sessionId: session.id, status: "error", title: session.title, error: String(error) }
      });
    }
  })();

  return {
    abort: () => abortController.abort()
  };
}
