import type { SDKMessage, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { ApiConfig } from "./config-store.js";

// OpenAI API 类型定义
type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
};

type OpenAIRequest = {
  model: string;
  messages: OpenAIMessage[];
  stream: boolean;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
};

type OpenAIStreamChunk = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
};

type OpenAIToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

// 工具定义映射（从 Anthropic 工具格式转换为 OpenAI 格式）
const ANTHROPIC_TOOLS: Record<string, OpenAIToolDefinition> = {
  ReadFile: {
    type: "function",
    function: {
      name: "ReadFile",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The path to the file to read" }
        },
        required: ["path"]
      }
    }
  },
  WriteFile: {
    type: "function",
    function: {
      name: "WriteFile",
      description: "Write content to a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The path to the file to write" },
          content: { type: "string", description: "The content to write" }
        },
        required: ["path", "content"]
      }
    }
  },
  ListDirectory: {
    type: "function",
    function: {
      name: "ListDirectory",
      description: "List the contents of a directory",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The path to the directory to list" }
        },
        required: ["path"]
      }
    }
  },
  RunCommand: {
    type: "function",
    function: {
      name: "RunCommand",
      description: "Run a shell command",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "The command to run" }
        },
        required: ["command"]
      }
    }
  },
  AskUserQuestion: {
    type: "function",
    function: {
      name: "AskUserQuestion",
      description: "Ask the user a question",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "The question to ask the user" }
        },
        required: ["question"]
      }
    }
  }
};

// 将消息历史转换为 OpenAI 格式
function convertMessagesToOpenAI(messages: OpenAIMessage[]): OpenAIMessage[] {
  return messages.map(msg => {
    if (typeof msg.content === "string") {
      return msg;
    }
    // 处理多模态内容
    return {
      ...msg,
      content: msg.content.map(item => {
        if (item.type === "text") {
          return { type: "text", text: item.text || "" };
        }
        return item;
      })
    };
  });
}


// 调用 OpenAI 兼容的聊天完成 API
export async function* openaiChatCompletion(
  config: ApiConfig,
  prompt: string,
  messageHistory: OpenAIMessage[] = [],
  onToolCall?: (toolName: string, input: unknown, toolCallId: string) => Promise<PermissionResult>,
  abortSignal?: AbortSignal,
  options?: {
    cwd?: string;
    permissionMode?: string;
  }
): AsyncGenerator<SDKMessage, void, unknown> {
  const baseURL = config.baseURL.endsWith("/")
      ? config.baseURL.slice(0, -1)
      : config.baseURL;
  const apiURL = baseURL.includes("/v1")
      ? `${baseURL}/chat/completions`
      : `${baseURL}/v1/chat/completions`;

  const sessionId = crypto.randomUUID();
  let currentMessageHistory: OpenAIMessage[] = [...messageHistory];

  // 如果是第一次调用，添加用户消息
  if (prompt) {
    currentMessageHistory.push({role: "user", content: prompt});
  }

  // 循环处理多轮对话（包括工具调用）
  while (true) {
    // 构建请求
    const requestBody: OpenAIRequest = {
      model: config.model,
      messages: convertMessagesToOpenAI(currentMessageHistory),
      stream: true,
      tools: Object.values(ANTHROPIC_TOOLS),
      tool_choice: "auto"
    };

    let accumulatedContent = "";
    let accumulatedToolCalls: Array<{ id: string; name: string; arguments: string }> = [];
    let hasToolCalls = false;

    try {
      console.log("[openai-adapter] Making request to:", apiURL);
      console.log("[openai-adapter] Request body:", JSON.stringify(requestBody, null, 2));

      const response = await fetch(apiURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[openai-adapter] API request failed:", response.status, errorText);
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        console.error("[openai-adapter] No response body");
        throw new Error("No response body");
      }

      console.log("[openai-adapter] Response received, status:", response.status);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let hasReceivedData = false;

      // 只在第一次请求时发送初始化消息
      if (currentMessageHistory.length === (messageHistory.length + (prompt ? 1 : 0))) {
        yield {
          type: "system",
          subtype: "init",
          uuid: crypto.randomUUID(),
          session_id: sessionId,
          model: config.model,
          permissionMode: options?.permissionMode || "bypassPermissions",
          cwd: options?.cwd || "-"
        } as unknown as SDKMessage;
      }

      while (true) {
        const {done, value} = await reader.read();
        if (done) {
          console.log("[openai-adapter] Stream ended, buffer:", buffer);
          break;
        }

        hasReceivedData = true;
        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "" || !line.startsWith("data: ")) {
            if (line.trim() !== "") {
              console.log("[openai-adapter] Skipping non-data line:", line);
            }
            continue;
          }

          const dataStr = line.slice(6);
          if (dataStr === "[DONE]") {
            console.log("[openai-adapter] Received [DONE] marker");
            // 流结束，跳出内层循环
            break;
          }

          try {
            const chunk: OpenAIStreamChunk = JSON.parse(dataStr);
            console.log("[openai-adapter] Parsed chunk:", JSON.stringify(chunk).substring(0, 200));

            // 处理内容增量
            if (chunk.choices[0]?.delta?.content) {
              accumulatedContent += chunk.choices[0].delta.content;
              // 直接生成流式消息
              yield {
                type: "stream_event",
                event: {
                  type: "content_block_delta",
                  delta: {
                    type: "text",
                    text: chunk.choices[0].delta.content
                  }
                },
                parent_tool_use_id: null,
                uuid: crypto.randomUUID(),
                session_id: sessionId
              } as unknown as SDKMessage;
            }

            // 处理工具调用增量
            if (chunk.choices[0]?.delta?.tool_calls) {
              for (const toolCall of chunk.choices[0].delta.tool_calls) {
                if (toolCall.id && toolCall.function) {
                  const existingIndex = accumulatedToolCalls.findIndex(tc => tc.id === toolCall.id);
                  if (existingIndex >= 0) {
                    // 累积参数
                    accumulatedToolCalls[existingIndex].arguments += toolCall.function.arguments || "";
                    // 更新名称（如果提供了）
                    if (toolCall.function.name) {
                      accumulatedToolCalls[existingIndex].name = toolCall.function.name;
                    }
                  } else {
                    // 新的工具调用
                    accumulatedToolCalls.push({
                      id: toolCall.id,
                      name: toolCall.function.name || "",
                      arguments: toolCall.function.arguments || ""
                    });
                  }
                }
              }
            }

            // 处理完成状态
            const finishReason = chunk.choices[0]?.finish_reason;
            console.log("[openai-adapter] Finish reason:", finishReason, "accumulatedContent length:", accumulatedContent.length, "toolCalls:", accumulatedToolCalls.length);
            
            if (finishReason === "stop") {
              // 文本完成，发送最终消息
              if (accumulatedContent) {
                yield {
                  type: "assistant",
                  message: {
                    content: [{type: "text", text: accumulatedContent}],
                    role: "assistant"
                  },
                  parent_tool_use_id: null,
                  uuid: crypto.randomUUID(),
                  session_id: sessionId
                } as unknown as SDKMessage;
                // 更新消息历史
                currentMessageHistory.push({
                  role: "assistant",
                  content: accumulatedContent
                });
              }
              // 跳出内层循环，准备发送最终结果
              break;
            } else if (finishReason === "tool_calls" && accumulatedToolCalls.length > 0) {
              // 工具调用完成
              hasToolCalls = true;
              
              // 确保所有工具调用的参数都已完整接收
              const completeToolCalls = accumulatedToolCalls.filter(tc => tc.id && tc.name);
              
              if (completeToolCalls.length === 0) {
                console.warn("[openai-adapter] No complete tool calls found");
                break;
              }
              
              yield {
                type: "assistant",
                message: {
                  content: completeToolCalls.map(tc => {
                    let parsedInput: unknown = {};
                    try {
                      parsedInput = JSON.parse(tc.arguments || "{}");
                    } catch (error) {
                      console.error(`[openai-adapter] Failed to parse tool arguments for ${tc.name}:`, error, "Arguments:", tc.arguments);
                      parsedInput = {};
                    }
                    return {
                      type: "tool_use",
                      id: tc.id,
                      name: tc.name,
                      input: parsedInput
                    };
                  }),
                  role: "assistant"
                },
                parent_tool_use_id: null,
                uuid: crypto.randomUUID(),
                session_id: sessionId
              } as unknown as SDKMessage;

              // 处理工具调用
              const toolResults: OpenAIMessage[] = [];
              for (const toolCall of completeToolCalls) {
                if (onToolCall) {
                  try {
                    let toolInput: unknown = {};
                    try {
                      toolInput = JSON.parse(toolCall.arguments || "{}");
                    } catch (error) {
                      console.error(`[openai-adapter] Failed to parse tool arguments for ${toolCall.name}:`, error, "Arguments:", toolCall.arguments);
                      toolInput = {};
                    }
                    const result = await onToolCall(toolCall.name, toolInput, toolCall.id);

                    // 处理 PermissionResult
                    let toolContent: string;
                    if (typeof result === "object" && result !== null && "behavior" in result) {
                      if (result.behavior === "allow" && "updatedInput" in result) {
                        toolContent = JSON.stringify(result.updatedInput || toolInput);
                      } else if (result.behavior === "deny" && "message" in result) {
                        toolContent = JSON.stringify({error: result.message || "Permission denied"});
                      } else {
                        toolContent = JSON.stringify({error: "Permission denied"});
                      }
                    } else {
                      toolContent = typeof result === "string" ? result : JSON.stringify(result);
                    }

                    toolResults.push({
                      role: "tool",
                      content: toolContent,
                      tool_call_id: toolCall.id
                    });
                  } catch (error) {
                    console.error(`[openai-adapter] Tool call failed for ${toolCall.name}:`, error);
                    toolResults.push({
                      role: "tool",
                      content: JSON.stringify({error: String(error)}),
                      tool_call_id: toolCall.id
                    });
                  }
                }
              }

              // 更新消息历史，准备下一轮请求
              currentMessageHistory.push({
                role: "assistant",
                content: "",
                tool_calls: completeToolCalls.map(tc => ({
                  id: tc.id,
                  type: "function" as const,
                  function: {
                    name: tc.name,
                    arguments: tc.arguments
                  }
                }))
              });
              currentMessageHistory.push(...toolResults);
              accumulatedToolCalls = [];
              accumulatedContent = "";

              // 继续下一轮循环，发送包含工具结果的请求
              break;
            }
          } catch (error) {
            console.error("[openai-adapter] Failed to parse chunk:", error, "Data:", dataStr);
          }
        }
      }

      // 检查是否收到了任何数据
      if (!hasReceivedData) {
        console.warn("[openai-adapter] No data received from stream");
      }

      // 如果没有工具调用，且流已结束，发送最终结果并退出
      if (!hasToolCalls) {
        if (accumulatedContent) {
          // 更新消息历史
          currentMessageHistory.push({
            role: "assistant",
            content: accumulatedContent
          });
        }

        // 发送最终结果
        yield {
          type: "result",
          subtype: "success",
          duration_ms: 0,
          duration_api_ms: 0,
          is_error: false,
          num_turns: 1,
          result: accumulatedContent,
          total_cost_usd: 0,
          usage: {input_tokens: 0, output_tokens: 0},
          modelUsage: {},
          permission_denials: [],
          uuid: crypto.randomUUID(),
          session_id: sessionId
        } as unknown as SDKMessage;
        return;
      }
    } catch (error) {
       console.error("[openai-adapter] Error in openaiChatCompletion:", error);
        if (error instanceof Error && error.name === "AbortError") {
          yield {
            type: "result",
            subtype: "error_during_execution",
            duration_ms: 0,
            duration_api_ms: 0,
            is_error: true,
            num_turns: 0,
            total_cost_usd: 0,
            usage: {input_tokens: 0, output_tokens: 0},
            modelUsage: {},
            permission_denials: [],
            errors: ["Request aborted"],
            uuid: crypto.randomUUID(),
            session_id: sessionId
          } as unknown as SDKMessage;
          return;
        }

        yield {
          type: "result",
          subtype: "error_during_execution",
          duration_ms: 0,
          duration_api_ms: 0,
          is_error: true,
          num_turns: 0,
          total_cost_usd: 0,
          usage: {input_tokens: 0, output_tokens: 0},
          modelUsage: {},
          permission_denials: [],
          errors: [error instanceof Error ? error.message : String(error)],
          uuid: crypto.randomUUID(),
          session_id: sessionId
        } as unknown as SDKMessage;
        return;
      }
    }
  }


// 生成会话标题（使用 OpenAI 格式）
export async function openaiGenerateTitle(
      config: ApiConfig,
      userIntent: string
  ): Promise<string> {
    const baseURL = config.baseURL.endsWith("/")
        ? config.baseURL.slice(0, -1)
        : config.baseURL;
    const apiURL = baseURL.includes("/v1")
        ? `${baseURL}/chat/completions`
        : `${baseURL}/v1/chat/completions`;

    const messages: OpenAIMessage[] = [
      {
        role: "user",
        content: `Please analyze the following user input to generate a short but clear title to identify this conversation theme:\n${userIntent}\n\nDirectly output the title, do not include any other content.`
      }
    ];

    try {
      const response = await fetch(apiURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      return content?.trim() || "New Session";
    } catch (error) {
      console.error("[openai-adapter] Failed to generate title:", error);
      throw error;
    }
  }

