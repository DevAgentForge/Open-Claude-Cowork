import { query, type SDKMessage, type PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent } from "../types.js";
import type { Session } from "./session-store.js";
import { claudeCodePath, enhancedEnv} from "./util.js";
import { getCurrentApiConfig, buildEnvForConfig } from "./claude-settings.js";
import { openaiChatCompletion } from "./openai-adapter.js";
import { sessions as sessionStore } from "../ipc-handlers.js";
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { join, resolve } from "path";

const execAsync = promisify(exec);


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

// 获取消息历史用于 OpenAI 格式（从会话历史中提取）
async function getMessageHistoryForOpenAI(sessionId: string): Promise<Array<{ role: "user" | "assistant" | "system" | "tool"; content: string; tool_call_id?: string }>> {
  const history = sessionStore.getSessionHistory(sessionId);
  if (!history) return [];

  const messages: Array<{ role: "user" | "assistant" | "system" | "tool"; content: string; tool_call_id?: string }> = [];
  
  for (const msg of history.messages) {
    if (msg.type === "user_prompt") {
      messages.push({
        role: "user",
        content: msg.prompt
      });
    } else if (msg.type === "assistant" && "content" in msg) {
      const content = msg.content as Array<{ type: string; text?: string }>;
      const textContent = content
        .filter(c => c.type === "text")
        .map(c => c.text || "")
        .join("\n");
      
      if (textContent) {
        messages.push({
          role: "assistant",
          content: textContent
        });
      }
    }
  }
  
  return messages;
}


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
      const apiType = config?.apiType || "anthropic";

      // 根据 API 类型选择不同的调用方式
      if (apiType === "openai-compatible" && config) {
        console.log("[runner] Using OpenAI-compatible adapter");
        console.log("[runner] Config:", { 
          baseURL: config.baseURL, 
          model: config.model, 
          apiType: config.apiType 
        });
        
        // 使用 OpenAI 兼容适配器
        // 新会话（没有 resumeSessionId）时不传递历史记录
        const messageHistory = resumeSessionId 
          ? await getMessageHistoryForOpenAI(session.id)
          : [];
        
        console.log("[runner] Message history length:", messageHistory.length, "resumeSessionId:", resumeSessionId);

        const q = openaiChatCompletion(
          config,
          prompt,
          messageHistory,
          async (toolName, input, toolCallId) => {
            // For AskUserQuestion, we need to wait for user response
            if (toolName === "AskUserQuestion") {
              // Send permission request to frontend
              sendPermissionRequest(toolCallId, toolName, input);

              // Create a promise that will be resolved when user responds
              return new Promise<PermissionResult>((resolve) => {
                session.pendingPermissions.set(toolCallId, {
                  toolUseId: toolCallId,
                  toolName,
                  input,
                  resolve: (result) => {
                    session.pendingPermissions.delete(toolCallId);
                    resolve(result as PermissionResult);
                  }
                });

                // Handle abort
                abortController.signal.addEventListener("abort", () => {
                  session.pendingPermissions.delete(toolCallId);
                  resolve({ behavior: "deny", message: "Session aborted" });
                });
              });
            }

            // 执行其他工具
            const cwd = session.cwd ?? DEFAULT_CWD;
            let toolResult: unknown;

            try {
              // 验证输入参数
              if (!input || typeof input !== "object" || Array.isArray(input)) {
                throw new Error(`Invalid input for tool ${toolName}: expected object, got ${typeof input}`);
              }

              switch (toolName) {
                case "ReadFile": {
                  const path = (input as { path?: string }).path;
                  if (!path || typeof path !== "string") {
                    throw new Error("ReadFile requires a 'path' parameter of type string");
                  }
                  const fullPath = resolve(cwd, path);
                  const content = readFileSync(fullPath, "utf8");
                  toolResult = { content };
                  break;
                }
                case "WriteFile": {
                  const { path, content } = input as { path?: string; content?: string };
                  if (!path || typeof path !== "string") {
                    throw new Error("WriteFile requires a 'path' parameter of type string");
                  }
                  if (content === undefined) {
                    throw new Error("WriteFile requires a 'content' parameter");
                  }
                  const fullPath = resolve(cwd, path);
                  writeFileSync(fullPath, String(content), "utf8");
                  toolResult = { success: true };
                  break;
                }
                case "ListDirectory": {
                  // 如果没有提供 path，直接使用会话的工作目录（参考 Anthropic SDK 的行为）
                  const path = (input as { path?: string }).path;
                  // 如果 path 为空或未提供，直接使用 cwd；否则相对于 cwd 解析路径
                  const fullPath = path && typeof path === "string" && path.trim() !== "" 
                    ? resolve(cwd, path)
                    : cwd;
                  const entries = readdirSync(fullPath, { withFileTypes: true });
                  toolResult = {
                    entries: entries.map(entry => ({
                      name: entry.name,
                      type: entry.isDirectory() ? "directory" : "file"
                    }))
                  };
                  break;
                }
                case "RunCommand": {
                  const command = (input as { command?: string }).command;
                  if (!command || typeof command !== "string") {
                    throw new Error("RunCommand requires a 'command' parameter of type string");
                  }
                  const { stdout, stderr } = await execAsync(command, { cwd });
                  toolResult = {
                    stdout: stdout || "",
                    stderr: stderr || "",
                    exitCode: 0
                  };
                  break;
                }
                default:
                  toolResult = { error: `Unknown tool: ${toolName}` };
              }

              // 返回工具执行结果
              // 确保 updatedInput 是 Record<string, unknown> 类型
              const updatedInput: Record<string, unknown> = 
                typeof toolResult === "object" && toolResult !== null && !Array.isArray(toolResult)
                  ? toolResult as Record<string, unknown>
                  : { result: toolResult };
              
              return {
                behavior: "allow",
                updatedInput
              };
            } catch (error) {
              console.error(`[runner] Tool execution failed for ${toolName}:`, error);
              return {
                behavior: "allow",
                updatedInput: {
                  error: error instanceof Error ? error.message : String(error)
                }
              };
            }
          },
          abortController.signal,
          {
            cwd: session.cwd,
            permissionMode: "bypassPermissions"
          }
        );

        // 处理 OpenAI 消息流
        for await (const message of q) {
          // Extract session_id from system init message
          if (message.type === "system" && "subtype" in message && message.subtype === "init") {
            const sdkSessionId = (message as any).session_id;
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
      } else {
        // 使用 Anthropic SDK
        const env = buildEnvForConfig(config);
        const mergedEnv = {
          ...enhancedEnv,
          ...env
        };

        const q = query({
          prompt,
          options: {
            cwd: session.cwd ?? DEFAULT_CWD,
            resume: resumeSessionId,
            abortController,
            env: mergedEnv,
            pathToClaudeCodeExecutable: claudeCodePath,
            permissionMode: "bypassPermissions",
            includePartialMessages: true,
            allowDangerouslySkipPermissions: true,
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

              // Auto-approve other tools
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
