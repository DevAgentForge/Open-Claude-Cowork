import type { ClaudeSettingsEnv } from "../types.js";
import type { ConfigStore } from "./config-store.js";

let configStoreInstance: ConfigStore | null = null;

export function setConfigStore(store: ConfigStore): void {
  configStoreInstance = store;
}

export function getConfigStore(): ConfigStore | null {
  return configStoreInstance;
}

export function buildClaudeEnv(): ClaudeSettingsEnv {
  const config = configStoreInstance?.getConfig() ?? {};
  
  const env: ClaudeSettingsEnv = {
    ANTHROPIC_AUTH_TOKEN: config.apiKey ?? "",
    ANTHROPIC_BASE_URL: config.baseUrl ?? "",
    ANTHROPIC_MODEL: config.model ?? "",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "",
    API_TIMEOUT_MS: "",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "true",
  };

  return env;
}

export async function testAnthropicConnection(
  apiKey: string,
  baseUrl?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = baseUrl
      ? `${baseUrl.replace(/\/$/, "")}/v1/messages`
      : "https://api.anthropic.com/v1/messages";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1,
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    if (response.ok) {
      return { success: true };
    }

    const errorData = await response.json().catch(() => ({}));
    const errorMessage =
      (errorData as { error?: { message?: string } })?.error?.message ??
      `HTTP ${response.status}: ${response.statusText}`;

    // 401 means invalid API key
    if (response.status === 401) {
      return { success: false, error: "Invalid API key" };
    }

    // 400 with "credit balance is too low" still means key is valid
    if (
      response.status === 400 &&
      errorMessage.toLowerCase().includes("credit")
    ) {
      return { success: true };
    }

    return { success: false, error: errorMessage };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}
