import { query, type SDKMessage, type PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { ServerEvent } from "../types.js";
import type { Session } from "./session-store.js";

import { getCurrentApiConfig, buildEnvForConfig, getClaudeCodePath} from "./claude-settings.js";
import { getEnhancedEnv } from "./util.js";
import { promptInjectionDetector } from "./security/index.js";
import { AuditLogger } from "./audit/index.js";
import { app } from "electron";


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

// 创建审计日志实例
const auditLogger = new AuditLogger(`${app.getPath("userData")}/audit.db`);


export async function runClaude(options: RunnerOptions): Promise<RunnerHandle> {
  const { prompt, session, resumeSessionId, onEvent, onSessionUpdate } = options;
  const abortController = new AbortController();

  // 标志：是否应该执行查询
  let shouldExecute = true;

  // 检测 Prompt 注入攻击
  console.log("[Security] Checking prompt for injection attacks...");
  const injectionResult = promptInjectionDetector.detect(prompt);
  console.log("[Security] Injection detection result:", injectionResult);

  if (injectionResult.detected) {
    console.log("[Security] Prompt injection detected! Blocking execution.");
    // 设置标志，阻止后台执行
    shouldExecute = false;

    // 记录安全事件
    onEvent({
      type: "session.status",
      payload: {
        sessionId: session.id,
        status: "error",
        title: session.title,
        cwd: session.cwd,
        error: `Security alert: ${injectionResult.reason}`
      }
    });

    // 记录审计日志
    try {
      auditLogger.log({
        sessionId: session.id,
        operation: 'security-block',
        details: `Blocked prompt injection: ${injectionResult.reason}`,
        success: true
      });
    } catch (err) {
      console.error("Failed to log security event:", err);
    }

    // 返回一个空的 runner handle
    return {
      abort: () => {}
    };
  }
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
    // 检查是否应该执行（可能在检测到注入后被设置为 false）
    if (!shouldExecute) {
      return;
    }

    try {
      // 获取当前配置
      const config = getCurrentApiConfig();

      if (!config) {
        onEvent({
          type: "session.status",
          payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: "API configuration not found. Please configure API settings." }
        });

        // 记录审计日志
        try {
          await auditLogger.log({
            sessionId: session.id,
            operation: 'session-start',
            details: 'Failed: API configuration not found',
            success: false
          });
        } catch (auditError) {
          console.error("Failed to log audit entry:", auditError);
        }

        return;
      }
      
      // 记录会话开始
      try {
        await auditLogger.log({
          sessionId: session.id,
          operation: 'session-start',
          details: `Session started with prompt: ${prompt.substring(0, 100)}...`,
          success: true
        });
      } catch (auditError) {
        console.error("Failed to log session start:", auditError);
      }
      
      // 使用 Anthropic SDK
      const env = buildEnvForConfig(config);
      const mergedEnv = {
        ...getEnhancedEnv(),
        ...env
      };
      
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
          canUseTool: async (toolName, input, { signal }) => {
            // 记录工具调用开始
            let logId: string | undefined;
            try {
              logId = auditLogger.logStart(session.id, 'execute', toolName);
            } catch (auditError) {
              console.error("Failed to log tool start:", auditError);
            }
            
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

                    // 记录工具调用结束
                    try {
                      if (logId) {
                        auditLogger.logEnd(logId, result.behavior === 'allow', `Permission ${result.behavior}`);
                      }
                    } catch (auditError) {
                      console.error("Failed to log tool end:", auditError);
                    }

                    resolve(result as PermissionResult);
                  }
                });

                // Handle abort
                signal.addEventListener("abort", () => {
                  session.pendingPermissions.delete(toolUseId);

                  // 记录工具调用被中止
                  try {
                    if (logId) {
                      auditLogger.logEnd(logId, false, 'Aborted by user');
                    }
                  } catch (auditError) {
                    console.error("Failed to log tool abort:", auditError);
                  }

                  resolve({ behavior: "deny", message: "Session aborted" });
                });
              });
            }

            // Auto-approve other tools
            try {
              if (logId) {
                auditLogger.logEnd(logId, true, 'Auto-approved');
              }
            } catch (auditError) {
              console.error("Failed to log auto-approve:", auditError);
            }

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
          
          // 记录会话结束
          try {
            await auditLogger.log({
              sessionId: session.id,
              operation: 'session-stop',
              details: `Session ${status}`,
              success: status === 'completed'
            });
          } catch (auditError) {
            console.error("Failed to log session end:", auditError);
          }
        }
      }

      // Query completed normally
      if (session.status === "running") {
        onEvent({
          type: "session.status",
          payload: { sessionId: session.id, status: "completed", title: session.title }
        });
        
        // 记录会话完成
        try {
          await auditLogger.log({
            sessionId: session.id,
            operation: 'session-stop',
            details: 'Session completed successfully',
            success: true
          });
        } catch (auditError) {
          console.error("Failed to log session completion:", auditError);
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        // Session was aborted, don't treat as error
        try {
          await auditLogger.log({
            sessionId: session.id,
            operation: 'session-stop',
            details: 'Session aborted',
            success: false
          });
        } catch (auditError) {
          console.error("Failed to log session abort:", auditError);
        }
        return;
      }

      onEvent({
        type: "session.status",
        payload: { sessionId: session.id, status: "error", title: session.title, error: String(error) }
      });

      // 记录错误
      try {
        await auditLogger.log({
          sessionId: session.id,
          operation: 'session-stop',
          details: `Error: ${String(error)}`,
          success: false
        });
      } catch (auditError) {
        console.error("Failed to log session error:", auditError);
      }
    }
  })();

  return {
    abort: () => abortController.abort()
  };
}
