import { query, type SDKMessage, type PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent } from "../types.js";
import type { Session } from "./session-store.js";

import { getCurrentApiConfig, buildEnvForConfig, getClaudeCodePath } from "./claude-settings.js";
import { getEnhancedEnv } from "./util.js";
import { getMCPManager } from "./mcp/mcp-manager.js";
import { getAgentManager } from "./agents/agent-manager.js";


export type RunnerOptions = {
  prompt: string;
  session: Session;
  resumeSessionId?: string;
  onEvent: (event: ServerEvent) => void;
  onSessionUpdate?: (updates: Partial<Session>) => void;
};

export type RunnerHandle = {
  abort: () => void;
};

const DEFAULT_CWD = process.cwd();


export async function runClaude(options: RunnerOptions): Promise<RunnerHandle> {
  const { prompt, session, resumeSessionId, onEvent, onSessionUpdate } = options;
  const abortController = new AbortController();

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

  // Start the query in the background
  (async () => {
    try {
      // 获取当前配置
      const config = getCurrentApiConfig();

      if (!config) {
        onEvent({
          type: "session.status",
          payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: "API configuration not found. Please configure API settings." }
        });
        return;
      }

      // 使用 Anthropic SDK
      const env = buildEnvForConfig(config);
      const mergedEnv = {
        ...getEnhancedEnv(),
        ...env
      };

      // 构建 MCP Servers 配置（使用 MCP Manager）
      // 如果配置了 persistBrowser，会自动启动 SSE Server
      const manager = getMCPManager();
      const mcpServers = await manager.buildSDKConfigAsync();
      const mcpServerCount = Object.keys(mcpServers).length;

      if (mcpServerCount > 0) {
        console.log(`[MCP] Configured ${mcpServerCount} MCP server(s) for Claude SDK:`, Object.keys(mcpServers));

        // 检查是否有 SSE 模式的 Server
        for (const [id, config] of Object.entries(mcpServers)) {
          if ('url' in config) {
            console.log(`[MCP] Server ${id} using SSE mode at ${config.url}`);
          }
        }
      } else {
        console.log('[MCP] No MCP servers configured');
      }

      // 构建已启用的 Sub Agents 配置
      const agentManager = getAgentManager();
      const agents = agentManager.buildSDKAgentsConfig();

      if (agents) {
        console.log(`[Agents] Configured ${Object.keys(agents).length} sub agent(s):`, Object.keys(agents));
      }

      const q = query({
        prompt,
        options: {
          cwd: session.cwd ?? DEFAULT_CWD,
          resume: resumeSessionId,
          abortController,
          env: mergedEnv,
          pathToClaudeCodeExecutable: getClaudeCodePath(),
          permissionMode: "bypassPermissions",
          includePartialMessages: true,
          allowDangerouslySkipPermissions: true,
          // 注入 MCP Servers 配置
          mcpServers: mcpServerCount > 0 ? mcpServers : undefined,
          // 注入已启用的 Sub Agents
          agents,
          canUseTool: async (toolName, input, { signal }) => {
            // For AskUserQuestion, we need to wait for user response
            if (toolName === "AskUserQuestion") {
              const toolUseId = crypto.randomUUID();

              // Send permission request to frontend
              sendPermissionRequest(toolUseId, toolName, input);

              // Create a promise that will be resolved when user responds
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
            }

            // Auto-approve all other tools (including MCP tools)
            return { behavior: "allow", updatedInput: input };
          }
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
