import type { SDKMessage, PermissionResult } from "@anthropic-ai/claude-agent-sdk";

export type ClaudeSettingsEnv = {
  ANTHROPIC_AUTH_TOKEN: string;
  ANTHROPIC_BASE_URL: string;
  ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
  ANTHROPIC_DEFAULT_OPUS_MODEL: string;
  ANTHROPIC_DEFAULT_SONNET_MODEL: string;
  ANTHROPIC_MODEL: string;
  API_TIMEOUT_MS: string;
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: string;
};

// Custom LLM Provider Configuration (internal - contains sensitive data)
export type LlmProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  authToken: string;
  defaultModel?: string;
  models?: {
    opus?: string;
    sonnet?: string;
    haiku?: string;
  };
};

// Safe Provider Configuration (for IPC - NO sensitive data)
// This type is safe to send to the renderer process
export type SafeProviderConfig = {
  id: string;
  name: string;
  baseUrl?: string;
  defaultModel?: string;
  models?: {
    opus?: string;
    sonnet?: string;
    haiku?: string;
  };
  hasToken: boolean; // Indicates if token is configured (without exposing it)
  isDefault?: boolean; // Indicates if this is a default/builtin provider
};

export type UserPromptMessage = {
  type: "user_prompt";
  prompt: string;
};

export type StreamMessage = SDKMessage | UserPromptMessage;

export type SessionStatus = "idle" | "running" | "completed" | "error";

// Permission mode for tool execution
export type PermissionMode = "secure" | "free";

export type SessionInfo = {
  id: string;
  title: string;
  status: SessionStatus;
  claudeSessionId?: string;
  cwd?: string;
  createdAt: number;
  updatedAt: number;
};

// Server -> Client events
export type ServerEvent =
  | { type: "stream.message"; payload: { sessionId: string; message: StreamMessage } }
  | { type: "stream.user_prompt"; payload: { sessionId: string; prompt: string } }
  | { type: "session.status"; payload: { sessionId: string; status: SessionStatus; title?: string; cwd?: string; error?: string } }
  | { type: "session.list"; payload: { sessions: SessionInfo[] } }
  | { type: "session.history"; payload: { sessionId: string; status: SessionStatus; messages: StreamMessage[] } }
  | { type: "session.deleted"; payload: { sessionId: string } }
  | { type: "permission.request"; payload: { sessionId: string; toolUseId: string; toolName: string; input: unknown } }
  | { type: "runner.error"; payload: { sessionId?: string; message: string } }
  // Provider configuration events (using SafeProviderConfig - NO tokens sent to renderer)
  | { type: "provider.list"; payload: { providers: SafeProviderConfig[] } }
  | { type: "provider.saved"; payload: { provider: SafeProviderConfig } }
  | { type: "provider.deleted"; payload: { providerId: string } }
  | { type: "provider.data"; payload: { provider: SafeProviderConfig } };

// Provider save payload - token is optional (only set when creating new or updating token)
export type ProviderSavePayload = {
  id?: string;
  name: string;
  baseUrl: string;
  authToken?: string; // Only provided when setting/updating token
  defaultModel?: string;
  models?: {
    opus?: string;
    sonnet?: string;
    haiku?: string;
  };
};

// Client -> Server events
export type ClientEvent =
  | { type: "session.start"; payload: { title: string; prompt: string; cwd?: string; allowedTools?: string; providerId?: string; permissionMode?: PermissionMode } }
  | { type: "session.continue"; payload: { sessionId: string; prompt: string; providerId?: string } }
  | { type: "session.stop"; payload: { sessionId: string } }
  | { type: "session.delete"; payload: { sessionId: string } }
  | { type: "session.list" }
  | { type: "session.history"; payload: { sessionId: string } }
  | { type: "permission.response"; payload: { sessionId: string; toolUseId: string; result: PermissionResult } }
  // Provider configuration events
  | { type: "provider.list" }
  | { type: "provider.save"; payload: { provider: ProviderSavePayload } }
  | { type: "provider.delete"; payload: { providerId: string } }
  | { type: "provider.get"; payload: { providerId: string } };
