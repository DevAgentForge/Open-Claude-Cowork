import type { LlmProviderConfig, SafeProviderConfig, ProviderSavePayload } from "../types.js";
import { readFileSync, writeFileSync, existsSync, chmodSync, unlinkSync, renameSync } from "fs";
import { join } from "path";
import { app, safeStorage } from "electron";
import { randomUUID } from "crypto";
import { getDefaultProviderTemplates, getDefaultProvider } from "./default-providers.js";

const PROVIDERS_FILE = join(app.getPath("userData"), "providers.json");

/**
 * Atomically save providers with correct permissions from the start
 * Prevents TOCTOU race condition by writing with correct permissions immediately
 *
 * @param providers - The providers to save
 * @throws Error if write fails
 */
function saveProvidersAtomic(providers: LlmProviderConfig[]): void {
  const content = JSON.stringify(providers, null, 2);

  // Create temp file with restrictive permissions
  const tempPath = `${PROVIDERS_FILE}.tmp.${randomUUID()}`;

  try {
    // Write to temp file with correct permissions
    // This is atomic on most modern filesystems
    writeFileSync(tempPath, content, { mode: 0o600 });

    // Set permissions explicitly (redundant but provides defense in depth)
    chmodSync(tempPath, 0o600);

    // Rename to target file (atomic on POSIX systems)
    // On Windows, rename may fail if target exists, so we use a fallback
    try {
      renameSync(tempPath, PROVIDERS_FILE);
    } catch {
      // Windows fallback: copy and delete
      writeFileSync(PROVIDERS_FILE, content, { mode: 0o600 });
      chmodSync(PROVIDERS_FILE, 0o600);
      try {
        unlinkSync(tempPath);
      } catch {
        // Temp file may not exist if rename succeeded
      }
    }
  } catch (error) {
    // Cleanup temp file on error
    try {
      if (existsSync(tempPath)) {
        chmodSync(tempPath, 0o600);
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Magic prefix for encrypted tokens (deterministic detection)
 * Format: ENC:v1:<base64-encrypted-data>
 * @internal
 */
const ENCRYPTED_TOKEN_PREFIX = "ENC:v1:";

/**
 * Sanitize value for safe logging - prevents log injection (CWE-117)
 * Replaces control characters with underscores to maintain log readability
 * while neutralizing injection attempts.
 *
 * @param value - The value to sanitize
 * @returns Sanitized value safe for logging
 * @internal
 */
function sanitizeForLog(value: string): string {
  // Replace all control characters (ASCII 0-31 and 127) with underscore
  // This includes: \n, \r, \t, \v, \f, \0, etc.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f]/g, "_");
}

/**
 * Truncate a string for logging and sanitize control characters
 * @internal
 */
function truncateForLog(value: string): string {
  const sanitized = sanitizeForLog(value);
  // Remove any trailing incomplete UTF-8 sequences by truncating to a safe boundary
  return sanitized;
}

/**
 * Allow localhost/private IPs for local development (LiteLLM, etc.)
 * Set CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS=true to enable
 * SECURITY: Read at module load time and lock to prevent runtime modification
 */

// Read at module load time - this is the only time the env var is read
const ALLOW_LOCAL_PROVIDERS_READ = process.env.CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS;
const ALLOW_LOCAL_PROVIDERS = ALLOW_LOCAL_PROVIDERS_READ === "true" || ALLOW_LOCAL_PROVIDERS_READ === "1";

// Freeze the environment variable to prevent runtime modification
// This provides defense in depth even if an attacker gains process access
if (typeof process.env.CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS !== "undefined") {
  try {
    Object.defineProperty(process.env, "CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS", {
      value: ALLOW_LOCAL_PROVIDERS ? "true" : "false",
      writable: false,
      configurable: false,
      enumerable: true
    });
  } catch {
    // Some environments may not allow defineProperty on process.env
    // In such cases, document that runtime modification is possible
    console.warn(
      "[Security] Could not lock CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS environment variable",
      "Runtime modification may be possible - consider using a different configuration method"
    );
  }
}

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
      // Log security bypass for audit purposes
      console.warn(
        "[Security] SSRF validation bypassed for local providers",
        { url: parsed.href, hostname: hostname }
      );
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
      // Log detailed error internally for debugging (without exposing to user logs)
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      // Log to console with details but don't expose to user-facing errors
      console.error("[SECURITY] Token encryption failed:", {
        message: errorMessage,
        // Only include stack trace in debug mode
        ...(process.env.DEBUG ? { stack: errorStack } : {})
      });

      // Throw generic error to user - no internal details
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
        // SECURITY: Log without exposing that it's a plaintext token
        console.warn(`[SECURITY] Provider ${provider.id} has token format that will be upgraded on next save`);
      }
      return decrypted;
    }

    // Plaintext token - will be encrypted on next save
    // SECURITY: Log without exposing that it's specifically plaintext
    console.warn(`[SECURITY] Provider ${provider.id} token will be encrypted on next save`);
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
 * Includes default provider templates if no custom providers exist
 * @returns Safe provider configs without sensitive data
 */
export function loadProvidersSafe(): SafeProviderConfig[] {
  const userProviders = readProvidersFile().map(p => ({
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    defaultModel: p.defaultModel,
    models: p.models,
    hasToken: Boolean(p.authToken && p.authToken.length > 0),
    isDefault: false
  }));

  // Include default provider templates for easy selection
  const defaultTemplates = getDefaultProviderTemplates();

  // Filter out templates that user has already customized (same baseUrl)
  const userBaseUrls = new Set(userProviders.map(p => p.baseUrl));
  const uniqueTemplates = defaultTemplates.filter(t => !userBaseUrls.has(t.baseUrl));

  return [...userProviders, ...uniqueTemplates];
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
  // Use atomic write to prevent TOCTOU race condition (SEC-005)
  saveProvidersAtomic(encryptedProviders);

  return providerToSave;
}

export function deleteProvider(providerId: string): boolean {
  const providers = loadProviders();
  const filtered = providers.filter((p) => p.id !== providerId);
  if (filtered.length === providers.length) {
    return false;
  }
  // Encrypt and save atomically (SEC-005)
  const encryptedProviders = filtered.map(encryptSensitiveData);
  saveProvidersAtomic(encryptedProviders);
  return true;
}

export function getProvider(providerId: string): LlmProviderConfig | null {
  const providers = loadProviders();
  return providers.find((p) => p.id === providerId) || null;
}

/**
 * Pattern for valid model names
 * Allows: alphanumeric, hyphens, underscores, dots, slashes (for org/model format)
 * Examples: "claude-sonnet-4-20250514", "gpt-4", "deepseek-chat", "anthropic/claude-3-opus"
 */
const MODEL_NAME_PATTERN = /^[a-zA-Z0-9._/-]+$/;

/**
 * Maximum reasonable length for model names
 * Based on common model naming conventions
 */
const MAX_MODEL_NAME_LENGTH = 200;

/**
 * Result type for model config validation
 */
interface ValidationResult {
  valid: boolean;
  warnings?: string[];
}

/**
 * Validate models configuration with proper format validation
 *
 * @param models - The models object to validate
 * @returns ValidationResult with success status and any warnings
 */
function validateModelConfig(
  models?: { opus?: string; sonnet?: string; haiku?: string }
): ValidationResult {
  const result: ValidationResult = { valid: true, warnings: [] };

  if (!models) return result;

  if (typeof models !== "object") {
    return { valid: false };
  }

  const validKeys = ["opus", "sonnet", "haiku"];

  for (const [key, value] of Object.entries(models)) {
    // Only allow known keys
    if (!validKeys.includes(key)) {
      return { valid: false };
    }

    // Values must be string or undefined
    if (value !== undefined && typeof value !== "string") {
      return { valid: false };
    }

    if (typeof value === "string") {
      // Check length
      if (value.length === 0) {
        result.warnings?.push(`Empty model name for ${key} - will use default`);
        continue;
      }

      if (value.length > MAX_MODEL_NAME_LENGTH) {
        // Sanitize modelName for logging to prevent log injection
        const truncated = value.substring(0, 50);
        const sanitized = truncateForLog(truncated);
        console.warn(
          `[ProviderConfig] Model name for "${key}" exceeds ${MAX_MODEL_NAME_LENGTH} characters`,
          { modelName: sanitized + "..." }
        );
        return { valid: false };
      }

      // Validate format
      if (!MODEL_NAME_PATTERN.test(value)) {
        console.warn(
          `[ProviderConfig] Invalid model name format for "${sanitizeForLog(key)}": ${sanitizeForLog(value)}`,
          { hint: "Model names should contain only alphanumeric characters, hyphens, underscores, dots, and slashes" }
        );
        return { valid: false };
      }

      // Check for suspicious patterns
      if (value.includes("..") || value.includes("./") || value.includes("../")) {
        console.warn(
          `[ProviderConfig] Suspicious model name with path traversal: ${sanitizeForLog(key)}=${sanitizeForLog(value)}`
        );
        // Still allow it but warn - might be legitimate org/model format
      }
    }
  }

  return result;
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
  const modelValidation = validateModelConfig(payload.models);
  if (!modelValidation.valid) {
    throw new Error("Invalid models configuration: must be {opus?: string, sonnet?: string, haiku?: string}");
  }
  // Log any warnings
  if (modelValidation.warnings && modelValidation.warnings.length > 0) {
    console.warn(`[ProviderConfig] Model validation warnings: ${modelValidation.warnings.join(", ")}`);
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
    // Keep existing token if not provided in payload (SIMP-001)
    authToken: resolveAuthToken(payload.authToken, existingProvider?.authToken),
    defaultModel: payload.defaultModel,
    models: payload.models
  };

  if (existingIndex >= 0) {
    providers[existingIndex] = providerToSave;
  } else {
    providers.push(providerToSave);
  }

  // Encrypt and save atomically (SEC-005)
  const encryptedProviders = providers.map(encryptSensitiveData);
  saveProvidersAtomic(encryptedProviders);

  // Return safe config (without token)
  return toSafeProvider(providerToSave);
}

/**
 * Get environment variables for a provider by ID
 * Decrypts token on-demand - ONLY for use with subprocess
 * This function should ONLY be called from runner.ts when starting Claude
 * Also supports default provider templates (prefixed with "template_")
 */
/**
 * Token handling mode configuration
 * - "env-var": Traditional method (token in environment variable) - default for backwards compatibility
 * - "ipc": Token passed via encrypted IPC channel - recommended for production
 * - "prompt": Token prompted from user each time - most secure but least convenient
 */
type TokenHandlingMode = "env-var" | "ipc" | "prompt";

/**
 * Resolve auth token from payload, preserving existing if not provided
 *
 * @param newToken - The new token from the payload (may be empty/undefined)
 * @param existingToken - The existing token from storage (may be undefined)
 * @returns The token to use: newToken if provided, otherwise existingToken or empty string
 *
 * @internal
 */
function resolveAuthToken(newToken: string | undefined, existingToken: string | undefined): string {
  if (newToken && newToken.length > 0) {
    return newToken;
  }
  return existingToken || "";
}

/**
 * Get the configured token handling mode from environment
 * @internal
 */
function getTokenHandlingMode(): TokenHandlingMode {
  const mode = process.env.CLAUDE_COWORK_TOKEN_HANDLING;
  if (mode === "ipc" || mode === "prompt") {
    return mode;
  }
  return "env-var"; // Default to traditional behavior
}

export function getProviderEnvById(providerId: string): Record<string, string> | null {
  // Check if it's a default provider template
  if (providerId.startsWith("template_")) {
    const templateId = providerId.replace("template_", "");
    const defaultProvider = getDefaultProvider(templateId);
    if (defaultProvider) {
      // SEC-001: Sanitize templateId before logging to prevent log injection
      const sanitizedTemplateId = sanitizeForLog(templateId);
      console.log(`[ProviderConfig] Using default provider template: ${sanitizedTemplateId}`);
      // Use the default provider config with its envOverrides
      const env = getProviderEnv(defaultProvider as LlmProviderConfig);
      // Apply envOverrides from the default provider
      if (defaultProvider.envOverrides) {
        Object.assign(env, defaultProvider.envOverrides);
      }
      return env;
    }
  }

  const provider = getProvider(providerId);
  if (!provider) return null;
  return getProviderEnv(provider);
}

/**
 * Get environment variables for a specific provider configuration.
 * This allows overriding the default Claude Code settings with custom provider settings.
 *
 * SECURITY NOTE: When using env-var mode (default), the token is visible in:
 * - /proc/<pid>/environ on Linux
 * - Process explorer tools
 * Consider using "ipc" mode for enhanced security.
 */
export function getProviderEnv(
  provider: LlmProviderConfig,
  options?: { tokenHandling?: TokenHandlingMode }
): Record<string, string> {
  const env: Record<string, string> = {};
  const tokenHandling = options?.tokenHandling || getTokenHandlingMode();

  if (provider.baseUrl) {
    env.ANTHROPIC_BASE_URL = provider.baseUrl;
  }

  if (provider.authToken) {
    if (tokenHandling === "env-var") {
      // Traditional method - token in environment variable
      // WARNING: This is visible in /proc/<pid>/environ and process listings
      env.ANTHROPIC_AUTH_TOKEN = provider.authToken;
    } else if (tokenHandling === "ipc") {
      // Token will be provided via IPC channel - not set in environment
      env.ANTHROPIC_AUTH_TOKEN_IPC_MODE = "true";
    }
    // For "prompt" mode, we don't set any token env var
    // The SDK will prompt for token when needed
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
