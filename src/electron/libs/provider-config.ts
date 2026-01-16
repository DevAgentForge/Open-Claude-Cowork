import type { LlmProviderConfig, SafeProviderConfig, ProviderSavePayload } from "../types.js";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "fs";
import { join } from "path";
import { app, safeStorage } from "electron";
import { randomUUID } from "crypto";

const PROVIDERS_FILE = join(app.getPath("userData"), "providers.json");

/**
 * Magic prefix for encrypted tokens (deterministic detection)
 * Format: ENC:v1:<base64-encrypted-data>
 * @internal
 */
const ENCRYPTED_TOKEN_PREFIX = "ENC:v1:";

/**
 * Allow localhost/private IPs for local development (LiteLLM, etc.)
 * Set CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS=true to enable
 */
const ALLOW_LOCAL_PROVIDERS = process.env.CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS === "true";

/**
 * Validate provider baseUrl to prevent SSRF attacks (CWE-918)
 * Only allows HTTP/HTTPS URLs to public endpoints
 */
export function validateProviderUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    // Only allow HTTP and HTTPS protocols
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { valid: false, error: "Only HTTP/HTTPS URLs are allowed" };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block internal/private IP ranges (SSRF prevention - CWE-918)
    const blockedPatterns = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^169\.254\./, // Link-local
      /^0\./, // Current network
      /^::1$/, // IPv6 localhost
      /^fc00:/i, // IPv6 private
      /^fe80:/i, // IPv6 link-local
    ];

    // Allow localhost/private IPs if explicitly enabled (for local development)
    if (ALLOW_LOCAL_PROVIDERS) {
      return { valid: true };
    }

    for (const pattern of blockedPatterns) {
      if (pattern.test(hostname)) {
        return {
          valid: false,
          error: "Internal/private URLs are not allowed. Set CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS=true for local development."
        };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Convert internal LlmProviderConfig to SafeProviderConfig (NO tokens)
 * This is safe to send to the renderer process via IPC
 */
export function toSafeProvider(provider: LlmProviderConfig): SafeProviderConfig {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
    models: provider.models,
    hasToken: Boolean(provider.authToken && provider.authToken.length > 0),
    isDefault: false
  };
}

/**
 * Encrypt sensitive fields before storage (CWE-200 mitigation)
 * SECURITY [CWE-200]: Throws error on encryption failure - NEVER store plaintext tokens
 * Uses deterministic prefix (ENC:v1:) for reliable encrypted token detection
 */
function encryptSensitiveData(provider: LlmProviderConfig): LlmProviderConfig {
  const encrypted = { ...provider };
  if (encrypted.authToken) {
    // Skip if already encrypted with our prefix
    if (encrypted.authToken.startsWith(ENCRYPTED_TOKEN_PREFIX)) {
      return encrypted;
    }

    // Check if encryption is available on this system
    if (!safeStorage.isEncryptionAvailable()) {
      console.error("[SECURITY] Token encryption not available on this system");
      throw new Error("Token encryption not available - cannot securely store credentials");
    }
    try {
      const encryptedBuffer = safeStorage.encryptString(encrypted.authToken);
      encrypted.authToken = ENCRYPTED_TOKEN_PREFIX + encryptedBuffer.toString("base64");
    } catch (error) {
      console.error("[SECURITY] Token encryption failed:", error);
      throw new Error("Failed to encrypt token - refusing to store plaintext credentials");
    }
  }
  return encrypted;
}

/**
 * Check if token is in legacy encrypted format (heuristic for migration only)
 * @internal
 */
function isLegacyEncryptedToken(token: string): boolean {
  // Legacy format: base64 without prefix, typically >100 chars
  return /^[A-Za-z0-9+/]+=*$/.test(token) && token.length > 100;
}

/**
 * Decrypt sensitive fields after reading from storage
 * SECURITY [CWE-200]: Uses deterministic prefix for reliable detection
 * For backward compatibility, migrates legacy encrypted tokens
 */
function decryptSensitiveData(provider: LlmProviderConfig): LlmProviderConfig {
  const decrypted = { ...provider };
  if (decrypted.authToken) {
    // New format: deterministic prefix
    if (decrypted.authToken.startsWith(ENCRYPTED_TOKEN_PREFIX)) {
      try {
        const base64Data = decrypted.authToken.slice(ENCRYPTED_TOKEN_PREFIX.length);
        decrypted.authToken = safeStorage.decryptString(Buffer.from(base64Data, "base64"));
      } catch (error) {
        console.error(`[SECURITY] Failed to decrypt token for provider ${provider.id}:`, error);
        throw new Error("Failed to decrypt token - data may be corrupted");
      }
      return decrypted;
    }

    // Legacy format: heuristic detection (for migration)
    if (isLegacyEncryptedToken(decrypted.authToken)) {
      try {
        decrypted.authToken = safeStorage.decryptString(Buffer.from(decrypted.authToken, "base64"));
        console.info(`[SECURITY] Migrated legacy encrypted token for provider ${provider.id}`);
      } catch {
        // Failed to decrypt - might be a very long plaintext token
        console.warn(`[SECURITY] Provider ${provider.id} has unrecognized token format - treating as plaintext`);
      }
      return decrypted;
    }

    // Plaintext token - will be encrypted on next save
    console.warn(`[SECURITY] Provider ${provider.id} has plaintext token - will be encrypted on next save`);
  }
  return decrypted;
}

/**
 * Read raw providers from file (internal helper to avoid duplication)
 * @returns Raw provider configs without decryption
 * @internal
 */
function readProvidersFile(): LlmProviderConfig[] {
  try {
    if (existsSync(PROVIDERS_FILE)) {
      const raw = readFileSync(PROVIDERS_FILE, "utf8");
      const providers = JSON.parse(raw);
      if (!Array.isArray(providers)) return [];
      return providers as LlmProviderConfig[];
    }
  } catch {
    // Ignore missing or invalid providers file
  }
  return [];
}

/**
 * Load providers with decrypted tokens (INTERNAL USE ONLY)
 * WARNING: Do NOT send this data to the renderer process
 * @returns Provider configs with decrypted tokens
 */
export function loadProviders(): LlmProviderConfig[] {
  return readProvidersFile().map(decryptSensitiveData);
}

/**
 * Load providers WITHOUT tokens - SAFE to send to renderer process
 * This function never decrypts tokens, ensuring they stay in main process
 * @returns Safe provider configs without sensitive data
 */
export function loadProvidersSafe(): SafeProviderConfig[] {
  return readProvidersFile().map(p => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    defaultModel: p.defaultModel,
    models: p.models,
    hasToken: Boolean(p.authToken && p.authToken.length > 0),
    isDefault: false
  }));
}

export function saveProvider(provider: LlmProviderConfig): LlmProviderConfig {
  // Reload providers fresh (don't use cached decrypted versions)
  const providers: LlmProviderConfig[] = [];
  try {
    if (existsSync(PROVIDERS_FILE)) {
      const raw = readFileSync(PROVIDERS_FILE, "utf8");
      const parsed = JSON.parse(raw) as LlmProviderConfig[];
      if (Array.isArray(parsed)) {
        // Decrypt existing providers to merge properly
        parsed.forEach(p => providers.push(decryptSensitiveData(p)));
      }
    }
  } catch {
    // Ignore missing or invalid providers file
  }

  const existingIndex = providers.findIndex((p) => p.id === provider.id);

  const providerToSave = existingIndex >= 0
    ? { ...providers[existingIndex], ...provider }
    : { ...provider, id: provider.id || randomUUID() };

  if (existingIndex >= 0) {
    providers[existingIndex] = providerToSave;
  } else {
    providers.push(providerToSave);
  }

  // Encrypt sensitive data before storage
  const encryptedProviders = providers.map(encryptSensitiveData);
  writeFileSync(PROVIDERS_FILE, JSON.stringify(encryptedProviders, null, 2));

  // Set restrictive file permissions (owner read/write only)
  try {
    chmodSync(PROVIDERS_FILE, 0o600);
  } catch {
    // Ignore permission errors (may not be supported on all platforms)
  }

  return providerToSave;
}

export function deleteProvider(providerId: string): boolean {
  const providers = loadProviders();
  const filtered = providers.filter((p) => p.id !== providerId);
  if (filtered.length === providers.length) {
    return false;
  }
  // Encrypt before saving
  const encryptedProviders = filtered.map(encryptSensitiveData);
  writeFileSync(PROVIDERS_FILE, JSON.stringify(encryptedProviders, null, 2));
  return true;
}

export function getProvider(providerId: string): LlmProviderConfig | null {
  const providers = loadProviders();
  return providers.find((p) => p.id === providerId) || null;
}

/**
 * Validate models configuration
 * @param models - The models object to validate
 * @returns true if valid, false otherwise
 */
function validateModelConfig(models?: { opus?: string; sonnet?: string; haiku?: string }): boolean {
  if (!models) return true;
  if (typeof models !== "object") return false;

  const validKeys = ["opus", "sonnet", "haiku"];
  for (const [key, value] of Object.entries(models)) {
    // Only allow known keys
    if (!validKeys.includes(key)) return false;
    // Values must be string or undefined
    if (value !== undefined && typeof value !== "string") return false;
    // Reasonable length limit for model names
    if (typeof value === "string" && value.length > 100) return false;
  }
  return true;
}

/**
 * Save provider from ProviderSavePayload (from renderer)
 * Token is optional - if not provided, keeps existing token
 * Returns SafeProviderConfig (without token) for IPC response
 * @param payload - The provider data from renderer
 * @returns SafeProviderConfig without sensitive data
 * @throws Error if baseUrl fails SSRF validation, models are invalid, or encryption fails
 */
export function saveProviderFromPayload(payload: ProviderSavePayload): SafeProviderConfig {
  // Validate URL to prevent SSRF (CWE-918)
  if (payload.baseUrl) {
    const urlValidation = validateProviderUrl(payload.baseUrl);
    if (!urlValidation.valid) {
      throw new Error(`Invalid provider URL: ${urlValidation.error}`);
    }
  }

  // Validate models configuration (CWE-20)
  if (!validateModelConfig(payload.models)) {
    throw new Error("Invalid models configuration: must be {opus?: string, sonnet?: string, haiku?: string}");
  }

  // Load existing providers
  const providers = loadProviders();
  const existingIndex = payload.id ? providers.findIndex((p) => p.id === payload.id) : -1;
  const existingProvider = existingIndex >= 0 ? providers[existingIndex] : null;

  // Build the provider config
  const providerToSave: LlmProviderConfig = {
    id: payload.id || randomUUID(),
    name: payload.name,
    baseUrl: payload.baseUrl,
    // Keep existing token if not provided in payload
    authToken: payload.authToken || existingProvider?.authToken || "",
    defaultModel: payload.defaultModel,
    models: payload.models
  };

  if (existingIndex >= 0) {
    providers[existingIndex] = providerToSave;
  } else {
    providers.push(providerToSave);
  }

  // Encrypt and save
  const encryptedProviders = providers.map(encryptSensitiveData);
  writeFileSync(PROVIDERS_FILE, JSON.stringify(encryptedProviders, null, 2));

  // Set restrictive file permissions
  try {
    chmodSync(PROVIDERS_FILE, 0o600);
  } catch {
    // Ignore permission errors
  }

  // Return safe config (without token)
  return toSafeProvider(providerToSave);
}

/**
 * Get environment variables for a provider by ID
 * Decrypts token on-demand - ONLY for use with subprocess
 * This function should ONLY be called from runner.ts when starting Claude
 */
export function getProviderEnvById(providerId: string): Record<string, string> | null {
  const provider = getProvider(providerId);
  if (!provider) return null;
  return getProviderEnv(provider);
}

/**
 * Get environment variables for a specific provider configuration.
 * This allows overriding the default Claude Code settings with custom provider settings.
 */
export function getProviderEnv(provider: LlmProviderConfig): Record<string, string> {
  const env: Record<string, string> = {};

  if (provider.baseUrl) {
    env.ANTHROPIC_BASE_URL = provider.baseUrl;
  }

  if (provider.authToken) {
    env.ANTHROPIC_AUTH_TOKEN = provider.authToken;
  }

  if (provider.defaultModel) {
    env.ANTHROPIC_MODEL = provider.defaultModel;
  }

  if (provider.models?.opus) {
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = provider.models.opus;
  }

  if (provider.models?.sonnet) {
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = provider.models.sonnet;
  }

  if (provider.models?.haiku) {
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = provider.models.haiku;
  }

  return env;
}
