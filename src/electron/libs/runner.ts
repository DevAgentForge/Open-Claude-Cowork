import { query, type SDKMessage, type PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent, PermissionMode } from "../types.js";
import type { Session } from "./session-store.js";
import { claudeCodePath, enhancedEnv } from "./util.js";

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
 * Create a canUseTool function based on permission mode and allowed tools
 * - "free" mode: auto-approve all tools except AskUserQuestion
 * - "secure" mode: require user approval for all tools
 */
export function createCanUseTool({
  session,
  sendPermissionRequest,
  permissionMode,
  allowedTools
}: PermissionRequestContext) {
  return async (toolName: string, input: unknown, { signal }: { signal: AbortSignal }) => {
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

    // Request user permission
    const toolUseId = crypto.randomUUID();
    sendPermissionRequest(toolUseId, toolName, input);

    return new Promise<PermissionResult>((resolve) => {
      session.pendingPermissions.set(toolUseId, {
        toolUseId,
        toolName,
        input,
        resolve: (result) => {
          session.pendingPermissions.delete(toolUseId);
          resolve(result as PermissionResult);
        }
      });

      // Handle abort
      signal.addEventListener("abort", () => {
        session.pendingPermissions.delete(toolUseId);
        resolve({ behavior: "deny", message: "Session aborted" });
      });
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
  const customEnv = providerEnv || {};

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
