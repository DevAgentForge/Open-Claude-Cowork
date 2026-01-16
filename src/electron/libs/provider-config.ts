import type { LlmProviderConfig, SafeProviderConfig, ProviderSavePayload } from "../types.js";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "fs";
import { join } from "path";
import { app, safeStorage } from "electron";
import { randomUUID } from "crypto";

const PROVIDERS_FILE = join(app.getPath("userData"), "providers.json");

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

    // Block internal/private IP ranges (SSRF prevention)
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

    for (const pattern of blockedPatterns) {
      if (pattern.test(hostname)) {
        return { valid: false, error: "Internal/private URLs are not allowed" };
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
 * SECURITY: Throws error on encryption failure - NEVER store plaintext tokens
 */
function encryptSensitiveData(provider: LlmProviderConfig): LlmProviderConfig {
  const encrypted = { ...provider };
  if (encrypted.authToken) {
    // Check if encryption is available on this system
    if (!safeStorage.isEncryptionAvailable()) {
      console.error("[SECURITY] Token encryption not available on this system");
      throw new Error("Token encryption not available - cannot securely store credentials");
    }
    try {
      encrypted.authToken = safeStorage.encryptString(encrypted.authToken).toString("base64");
    } catch (error) {
      console.error("[SECURITY] Token encryption failed:", error);
      throw new Error("Failed to encrypt token - refusing to store plaintext credentials");
    }
  }
  return encrypted;
}

/**
 * Decrypt sensitive fields after reading from storage
 * For backward compatibility, allows plaintext tokens from older versions
 */
function decryptSensitiveData(provider: LlmProviderConfig): LlmProviderConfig {
  const decrypted = { ...provider };
  if (decrypted.authToken) {
    // Check if token looks like base64-encoded encrypted data
    const looksEncrypted = /^[A-Za-z0-9+/]+=*$/.test(decrypted.authToken) &&
                          decrypted.authToken.length > 50; // Encrypted tokens are longer

    if (!looksEncrypted) {
      // Legacy plaintext token - log warning for migration awareness
      console.warn(`[SECURITY] Provider ${provider.id} has plaintext token - will be encrypted on next save`);
      return decrypted;
    }

    try {
      decrypted.authToken = safeStorage.decryptString(Buffer.from(decrypted.authToken, "base64"));
    } catch (error) {
      // Decryption failed - might be corrupted or legacy format
      console.warn(`[SECURITY] Failed to decrypt token for provider ${provider.id}:`, error);
      // Keep as-is for backward compatibility, will be re-encrypted on next save
    }
  }
  return decrypted;
}

/**
 * Load providers with decrypted tokens (INTERNAL USE ONLY)
 * WARNING: Do NOT send this data to the renderer process
 */
export function loadProviders(): LlmProviderConfig[] {
  try {
    if (existsSync(PROVIDERS_FILE)) {
      const raw = readFileSync(PROVIDERS_FILE, "utf8");
      const providers = JSON.parse(raw) as LlmProviderConfig[];
      if (!Array.isArray(providers)) return [];
      // Decrypt sensitive data for each provider
      return providers.map(decryptSensitiveData);
    }
  } catch {
    // Ignore missing or invalid providers file
  }
  return [];
}

/**
 * Load providers WITHOUT tokens - SAFE to send to renderer process
 * This function never decrypts tokens, ensuring they stay in main process
 */
export function loadProvidersSafe(): SafeProviderConfig[] {
  try {
    if (existsSync(PROVIDERS_FILE)) {
      const raw = readFileSync(PROVIDERS_FILE, "utf8");
      const providers = JSON.parse(raw) as LlmProviderConfig[];
      if (!Array.isArray(providers)) return [];
      // Convert to safe format without decrypting
      return providers.map(p => ({
        id: p.id,
        name: p.name,
        baseUrl: p.baseUrl,
        defaultModel: p.defaultModel,
        models: p.models,
        hasToken: Boolean(p.authToken && p.authToken.length > 0),
        isDefault: false
      }));
    }
  } catch {
    // Ignore missing or invalid providers file
  }
  return [];
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
 * Save provider from ProviderSavePayload (from renderer)
 * Token is optional - if not provided, keeps existing token
 * Returns SafeProviderConfig (without token) for IPC response
 * @throws Error if baseUrl fails SSRF validation or encryption fails
 */
export function saveProviderFromPayload(payload: ProviderSavePayload): SafeProviderConfig {
  // Validate URL to prevent SSRF (CWE-918)
  if (payload.baseUrl) {
    const urlValidation = validateProviderUrl(payload.baseUrl);
    if (!urlValidation.valid) {
      throw new Error(`Invalid provider URL: ${urlValidation.error}`);
    }
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
