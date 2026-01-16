# Plan de Corrección de Seguridad - PR #26

## Resumen Ejecutivo

Corregir los 12 issues identificados en la revisión comprehensiva del PR #26 (Custom LLM Providers).

**Complejidad:** 7/10
**Archivos a modificar:** 5
**Estimación de cambios:** ~300 líneas

---

## Fase 1: Issues Críticos (P0) - BLOQUEANTES

### Issue 1: SSRF localhost vs documentación
**Archivo:** `src/electron/libs/provider-config.ts:25-42`

**Cambios:**
```typescript
// 1. Agregar constante de configuración
const ALLOW_LOCAL_PROVIDERS = process.env.CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS === 'true';

// 2. Modificar validateProviderUrl() para aceptar localhost condicional
export function validateProviderUrl(url: string): { valid: boolean; error?: string } {
  // ... código existente ...

  // Permitir localhost si está habilitado (para desarrollo)
  if (ALLOW_LOCAL_PROVIDERS) {
    return { valid: true };
  }

  // Bloquear patterns internos solo si NO está permitido
  for (const pattern of blockedPatterns) {
    if (pattern.test(hostname)) {
      return { valid: false, error: "Internal/private URLs are not allowed. Set CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS=true for local development." };
    }
  }
  // ...
}
```

**Test:** Verificar que localhost funciona con env var y falla sin ella.

---

### Issue 2: Detección de token encriptado heurística débil
**Archivo:** `src/electron/libs/provider-config.ts:92-114`

**Cambios:**
```typescript
// 1. Definir prefijo mágico para tokens encriptados
const ENCRYPTED_TOKEN_PREFIX = 'ENC:v1:';

// 2. Modificar encryptSensitiveData()
function encryptSensitiveData(provider: LlmProviderConfig): LlmProviderConfig {
  const encrypted = { ...provider };
  if (encrypted.authToken && !encrypted.authToken.startsWith(ENCRYPTED_TOKEN_PREFIX)) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Token encryption not available");
    }
    const encryptedBuffer = safeStorage.encryptString(encrypted.authToken);
    encrypted.authToken = ENCRYPTED_TOKEN_PREFIX + encryptedBuffer.toString("base64");
  }
  return encrypted;
}

// 3. Modificar decryptSensitiveData()
function decryptSensitiveData(provider: LlmProviderConfig): LlmProviderConfig {
  const decrypted = { ...provider };
  if (decrypted.authToken) {
    if (decrypted.authToken.startsWith(ENCRYPTED_TOKEN_PREFIX)) {
      // Token encriptado con nuevo formato
      const base64Data = decrypted.authToken.slice(ENCRYPTED_TOKEN_PREFIX.length);
      decrypted.authToken = safeStorage.decryptString(Buffer.from(base64Data, "base64"));
    } else if (isLegacyEncryptedToken(decrypted.authToken)) {
      // Migración de formato antiguo (heurística solo para legacy)
      try {
        decrypted.authToken = safeStorage.decryptString(Buffer.from(decrypted.authToken, "base64"));
      } catch {
        // Mantener como está si falla
      }
    }
    // Si no tiene prefijo y no es legacy, es plaintext (se encriptará al guardar)
  }
  return decrypted;
}

// 4. Helper para detectar tokens legacy (solo para migración)
function isLegacyEncryptedToken(token: string): boolean {
  return /^[A-Za-z0-9+/]+=*$/.test(token) && token.length > 100;
}
```

**Test:** Verificar migración de tokens legacy y nuevos tokens usan prefijo.

---

## Fase 2: Alta Prioridad (P1) - PRE-RELEASE

### Issue 3: Validación de models faltante
**Archivo:** `src/electron/libs/provider-config.ts:227-270`

**Cambios:**
```typescript
// 1. Agregar función de validación
function validateModelConfig(models?: { opus?: string; sonnet?: string; haiku?: string }): boolean {
  if (!models) return true;
  const validKeys = ['opus', 'sonnet', 'haiku'];
  for (const [key, value] of Object.entries(models)) {
    if (!validKeys.includes(key)) return false;
    if (value !== undefined && typeof value !== 'string') return false;
    if (typeof value === 'string' && value.length > 100) return false; // Límite razonable
  }
  return true;
}

// 2. Usar en saveProviderFromPayload()
export function saveProviderFromPayload(payload: ProviderSavePayload): SafeProviderConfig {
  // Validar URL
  if (payload.baseUrl) {
    const urlValidation = validateProviderUrl(payload.baseUrl);
    if (!urlValidation.valid) {
      throw new Error(`Invalid provider URL: ${urlValidation.error}`);
    }
  }

  // Validar models
  if (!validateModelConfig(payload.models)) {
    throw new Error("Invalid models configuration: must be {opus?: string, sonnet?: string, haiku?: string}");
  }
  // ... resto del código
}
```

---

### Issue 4: sanitizePath rechaza comillas válidas
**Archivo:** `src/electron/libs/session-store.ts:277-310`

**Cambios:**
```typescript
// Modificar regex para permitir comillas en paths de directorio
private sanitizePath(inputPath: string): string {
  // 1. Detect null bytes (CWE-626)
  if (inputPath.includes("\0")) {
    throw new Error("Invalid path: null bytes not allowed");
  }

  // 2. Detect path traversal
  if (inputPath.includes("..")) {
    throw new Error("Invalid path: path traversal sequences not allowed");
  }

  // 3. Solo bloquear caracteres de shell peligrosos (no comillas)
  // Las comillas son válidas en nombres de archivo/directorio
  const dangerousShellChars = /[;&|`$<>]/;
  if (dangerousShellChars.test(inputPath)) {
    throw new Error("Invalid path: contains dangerous shell characters");
  }

  // 4. Normalize y validate existence
  const normalized = normalize(inputPath);
  const resolved = resolve(normalized);

  if (resolved.includes("..")) {
    throw new Error("Invalid path: path traversal detected after normalization");
  }

  if (!existsSync(resolved)) {
    throw new Error(`Invalid path: directory does not exist: ${resolved}`);
  }

  return resolved;
}
```

---

### Issue 5: Validación profunda de hooks
**Archivo:** `src/electron/libs/settings-manager.ts:147-152`

**Cambios:**
```typescript
// 1. Agregar validador de HookConfig
private isValidHookConfig(hook: unknown): hook is HookConfig {
  if (typeof hook !== "object" || hook === null) return false;
  const h = hook as Record<string, unknown>;
  if (typeof h.matcher !== "string") return false;
  if (!Array.isArray(h.hooks)) return false;
  for (const item of h.hooks) {
    if (typeof item !== "object" || item === null) return false;
    const i = item as Record<string, unknown>;
    if (typeof i.command !== "string") return false;
    if (i.type !== "command") return false;
    if (i.timeout !== undefined && typeof i.timeout !== "number") return false;
  }
  return true;
}

// 2. Usar en validateSettings()
if (obj.hooks !== undefined) {
  if (typeof obj.hooks !== "object" || obj.hooks === null) {
    throw new Error("hooks must be an object");
  }
  validated.hooks = {};
  for (const [event, eventHooks] of Object.entries(obj.hooks as Record<string, unknown>)) {
    if (Array.isArray(eventHooks)) {
      const validHooks = eventHooks.filter(h => this.isValidHookConfig(h));
      if (validHooks.length > 0) {
        validated.hooks[event] = validHooks as HookConfig[];
      }
    }
  }
}
```

---

### Issue 6: resetInstance() público
**Archivo:** `src/electron/libs/settings-manager.ts:315-317`

**Cambios:**
```typescript
/**
 * Reset singleton instance.
 * @internal Only for testing purposes
 */
static resetInstance(): void {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[SettingsManager] resetInstance() called outside test environment');
  }
  SettingsManager.instance = null;
}
```

---

## Fase 3: Media Prioridad (P2)

### Issue 7: Rate limiting en IPC
**Archivo:** `src/electron/ipc-handlers.ts`

**Cambios:**
```typescript
// 1. Importar throttle existente o crear simple rate limiter
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // requests
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(eventType: string): boolean {
  const now = Date.now();
  const key = eventType;
  const entry = requestCounts.get(key);

  if (!entry || now > entry.resetTime) {
    requestCounts.set(key, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    console.warn(`[IPC] Rate limit exceeded for ${eventType}`);
    return false;
  }

  entry.count++;
  return true;
}

// 2. Usar en handleClientEvent()
export function handleClientEvent(event: ClientEvent) {
  if (!checkRateLimit(event.type)) {
    return; // Silently drop rate-limited requests
  }
  // ... resto del handler
}
```

---

### Issue 8: Timeout en pendingPermissions
**Archivo:** `src/electron/libs/runner.ts:97-114`

**Cambios:**
```typescript
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// En createCanUseTool():
return new Promise<PermissionResult>((resolve) => {
  const timeoutId = setTimeout(() => {
    session.pendingPermissions.delete(toolUseId);
    resolve({ behavior: "deny", message: "Permission request timed out" });
  }, PERMISSION_TIMEOUT_MS);

  session.pendingPermissions.set(toolUseId, {
    toolUseId,
    toolName,
    input,
    resolve: (result) => {
      clearTimeout(timeoutId);
      session.pendingPermissions.delete(toolUseId);
      resolve(result as PermissionResult);
    }
  });

  signal.addEventListener("abort", () => {
    clearTimeout(timeoutId);
    session.pendingPermissions.delete(toolUseId);
    resolve({ behavior: "deny", message: "Session aborted" });
  });
});
```

---

### Issue 9: CI ignora ESLint
**Archivo:** `.github/workflows/ci.yml:27`

**Cambios:**
```yaml
- name: Run ESLint
  run: bun run lint
  # Fail on main, warn on PRs
  continue-on-error: ${{ github.event_name == 'pull_request' }}
```

---

## Fase 4: Baja Prioridad (P3)

### Issue 10: Estandarizar comentarios de seguridad
Agregar formato consistente:
```typescript
// SECURITY [CWE-XXX]: Descripción del control
```

### Issue 11: JSDoc en funciones exportadas
Agregar a todas las funciones `export function`:
- `@param` para cada parámetro
- `@returns` describiendo el retorno
- `@throws` para excepciones

### Issue 12: Refactorizar duplicación loadProviders
```typescript
// Helper interno para lectura de archivo
function readProvidersFile(): LlmProviderConfig[] {
  if (!existsSync(PROVIDERS_FILE)) return [];
  try {
    const raw = readFileSync(PROVIDERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Usar en loadProviders() y loadProvidersSafe()
export function loadProviders(): LlmProviderConfig[] {
  return readProvidersFile().map(decryptSensitiveData);
}

export function loadProvidersSafe(): SafeProviderConfig[] {
  return readProvidersFile().map(toSafeProvider);
}
```

---

## Archivos a Modificar

| Archivo | Issues | Prioridad |
|---------|--------|-----------|
| `src/electron/libs/provider-config.ts` | 1, 2, 3, 12 | P0, P1, P3 |
| `src/electron/libs/session-store.ts` | 4 | P1 |
| `src/electron/libs/settings-manager.ts` | 5, 6 | P1 |
| `src/electron/libs/runner.ts` | 8 | P2 |
| `src/electron/ipc-handlers.ts` | 7 | P2 |
| `.github/workflows/ci.yml` | 9 | P2 |
| `CUSTOM_PROVIDERS.md` | 1 (doc) | P0 |

---

## Verificación

### Tests Manuales
1. **SSRF (Issue 1):**
   - Sin env var: `http://localhost:4000` debe fallar
   - Con `CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS=true`: debe funcionar

2. **Token encryption (Issue 2):**
   - Guardar nuevo provider → token debe empezar con `ENC:v1:`
   - Cargar provider existente sin prefijo → debe migrar al guardar

3. **Models validation (Issue 3):**
   - Enviar `models: { invalid: "test" }` → debe rechazar

4. **Path sanitization (Issue 4):**
   - Path con comillas simples debe aceptarse
   - Path con `$` o `;` debe rechazarse

5. **Permission timeout (Issue 8):**
   - No responder a permission request → debe timeout en 5 min

### Comandos de Verificación
```bash
# Build y lint
bun run lint
bun run transpile:electron
bun run build

# Test con localhost habilitado
CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS=true bun run dev
```

---

## Orden de Implementación

1. ✅ Issue 2 (token prefix) - Base para otros cambios
2. ✅ Issue 1 (SSRF localhost) - Desbloquea desarrollo
3. ✅ Issue 3 (models validation) - Mismo archivo
4. ✅ Issue 12 (refactor duplicación) - Mismo archivo
5. ✅ Issue 4 (sanitizePath) - session-store.ts
6. ✅ Issue 5, 6 (settings-manager) - Mismo archivo
7. ✅ Issue 7, 8 (IPC/runner) - Archivos separados
8. ✅ Issue 9 (CI) - workflow
9. ✅ Issues 10, 11 (comentarios/JSDoc) - Múltiples archivos

---

## Actualización de Documentación

### CUSTOM_PROVIDERS.md
Agregar sección:
```markdown
## Local Development

For local proxies (LiteLLM, etc.), set the environment variable:

```bash
export CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS=true
```

This allows `localhost` and private IP addresses as provider URLs.
**WARNING:** Only use in development environments.
```
