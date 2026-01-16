# Plan Completo: Correcciones de Seguridad PR #26

## Resumen Ejecutivo

Este plan aborda los 12 issues identificados en la revision comprehensiva del PR #26 "Add support for custom LLM API providers". El plan esta organizado en 4 fases, priorizando los issues criticos (P0) y altos (P1) para desbloquear el merge.

---

## Clasificacion

| Atributo | Valor |
|----------|-------|
| **Complejidad** | 7/10 (Security-critical, multi-file) |
| **Modelo recomendado** | Claude Opus (security review) |
| **Validacion adversarial** | Si (complexity >= 7) |
| **Worktree** | Recomendado (multiple security fixes) |

---

## Fase 1: Issues Criticos (P0) - BLOQUEANTES

### Issue 1: Validacion SSRF vs Documentacion Localhost

**Archivo**: `src/electron/libs/provider-config.ts:25-42`
**CWE**: CWE-918 (Server-Side Request Forgery)

**Problema**:
- La validacion bloquea URLs locales (localhost, 127.x.x.x)
- PERO `CUSTOM_PROVIDERS.md` documenta uso de LiteLLM proxy local
- Contradiccion entre implementacion y documentacion

**Solucion propuesta**:

```typescript
// Agregar flag de configuracion para desarrollo
interface ProviderValidationOptions {
  allowLocalProviders?: boolean;
}

export function validateProviderUrl(
  url: string,
  options: ProviderValidationOptions = {}
): { valid: boolean; error?: string } {
  // ... existing code ...

  // Allow localhost ONLY if explicitly enabled via env var or flag
  const allowLocal = options.allowLocalProviders ||
    process.env.CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS === "true";

  if (!allowLocal) {
    for (const pattern of blockedPatterns) {
      if (pattern.test(hostname)) {
        return { valid: false, error: "Internal/private URLs are not allowed" };
      }
    }
  } else {
    // Log warning when using local providers
    console.warn("[SECURITY] Local provider URL allowed - only use in development");
  }

  return { valid: true };
}
```

**Archivos a modificar**:
1. `src/electron/libs/provider-config.ts` - Agregar flag `allowLocalProviders`
2. `CUSTOM_PROVIDERS.md` - Documentar la variable de entorno `CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS`

**Tests requeridos**:
- Test que localhost es bloqueado por defecto
- Test que localhost es permitido con flag/env var
- Test que muestra warning en logs cuando se usa local

---

### Issue 2: Deteccion de Token Encriptado (Heuristica Debil)

**Archivo**: `src/electron/libs/provider-config.ts:96-97`
**CWE**: CWE-200 (Information Exposure)

**Problema actual**:
```typescript
const looksEncrypted = /^[A-Za-z0-9+/]+=*$/.test(decrypted.authToken) &&
                      decrypted.authToken.length > 50;
```

Un token de API largo (>50 chars) en formato base64-like sera tratado como encriptado y fallara silenciosamente.

**Solucion propuesta** - Magic Prefix:

```typescript
// Constante para identificar datos encriptados de forma deterministica
const ENCRYPTED_TOKEN_PREFIX = "ENC:v1:"; // version para futuras migraciones

function encryptSensitiveData(provider: LlmProviderConfig): LlmProviderConfig {
  const encrypted = { ...provider };
  if (encrypted.authToken) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Token encryption not available");
    }
    try {
      const encryptedData = safeStorage.encryptString(encrypted.authToken).toString("base64");
      // Agregar prefijo para identificacion deterministica
      encrypted.authToken = ENCRYPTED_TOKEN_PREFIX + encryptedData;
    } catch (error) {
      throw new Error("Failed to encrypt token");
    }
  }
  return encrypted;
}

function decryptSensitiveData(provider: LlmProviderConfig): LlmProviderConfig {
  const decrypted = { ...provider };
  if (decrypted.authToken) {
    // Deteccion deterministica via prefijo
    if (decrypted.authToken.startsWith(ENCRYPTED_TOKEN_PREFIX)) {
      try {
        const encryptedData = decrypted.authToken.slice(ENCRYPTED_TOKEN_PREFIX.length);
        decrypted.authToken = safeStorage.decryptString(Buffer.from(encryptedData, "base64"));
      } catch (error) {
        console.error(`[SECURITY] Failed to decrypt token for provider ${provider.id}`);
        // Clear corrupted token rather than keep it
        decrypted.authToken = "";
      }
    } else {
      // Legacy plaintext token - will be encrypted on next save
      console.warn(`[SECURITY] Provider ${provider.id} has plaintext token - will be encrypted on next save`);
    }
  }
  return decrypted;
}
```

**Migracion**:
- Tokens existentes sin prefijo se tratan como plaintext (backward compatible)
- Al guardar, se encriptan con el nuevo prefijo
- Migracion transparente al usuario

**Archivos a modificar**:
1. `src/electron/libs/provider-config.ts` - Implementar magic prefix

---

## Fase 2: Issues de Alta Prioridad (P1)

### Issue 3: Validacion de Models en Provider Payload

**Archivo**: `src/electron/libs/provider-config.ts:227-270`

**Problema**: `payload.models` se acepta sin validacion

**Solucion**:

```typescript
interface ModelConfig {
  opus?: string;
  sonnet?: string;
  haiku?: string;
}

function validateModelConfig(models: unknown): ModelConfig | undefined {
  if (models === undefined || models === null) return undefined;
  if (typeof models !== "object") return undefined;

  const validated: ModelConfig = {};
  const m = models as Record<string, unknown>;

  if (m.opus !== undefined && typeof m.opus === "string" && m.opus.trim()) {
    validated.opus = m.opus.trim();
  }
  if (m.sonnet !== undefined && typeof m.sonnet === "string" && m.sonnet.trim()) {
    validated.sonnet = m.sonnet.trim();
  }
  if (m.haiku !== undefined && typeof m.haiku === "string" && m.haiku.trim()) {
    validated.haiku = m.haiku.trim();
  }

  return Object.keys(validated).length > 0 ? validated : undefined;
}

export function saveProviderFromPayload(payload: ProviderSavePayload): SafeProviderConfig {
  // ... existing validation ...

  // Validate models
  const validatedModels = validateModelConfig(payload.models);

  const providerToSave: LlmProviderConfig = {
    // ...
    models: validatedModels  // Ahora validado
  };
}
```

---

### Issue 4: sanitizePath Rechaza Paths con Comillas Validas

**Archivo**: `src/electron/libs/session-store.ts:289-291`

**Problema**: Paths con comillas son validos en filesystems pero rechazados

**Solucion** - Distinguir contexto shell vs filesystem:

```typescript
/**
 * Sanitize path for filesystem operations (CWE-22)
 * Note: Shell-dangerous chars only blocked if used with shell execution
 */
private sanitizePath(inputPath: string, forShellExecution: boolean = false): string {
  // 1. Null bytes - always blocked
  if (inputPath.includes("\0")) {
    throw new Error("Invalid path: null bytes not allowed");
  }

  // 2. Path traversal - always blocked
  if (inputPath.includes("..")) {
    throw new Error("Invalid path: path traversal sequences not allowed");
  }

  // 3. Shell-dangerous chars - only if for shell execution
  if (forShellExecution) {
    const dangerousChars = /[;&|`$<>]/;  // Removed quotes
    if (dangerousChars.test(inputPath)) {
      throw new Error("Invalid path: contains dangerous shell characters");
    }
  }

  // 4. Normalize and resolve
  const normalized = normalize(inputPath);
  const resolved = resolve(normalized);

  // 5. Verify post-normalization
  if (resolved.includes("..")) {
    throw new Error("Invalid path: path traversal detected after normalization");
  }

  // 6. Validate existence
  if (!existsSync(resolved)) {
    throw new Error(`Invalid path: directory does not exist: ${resolved}`);
  }

  return resolved;
}
```

**Nota**: En el contexto actual (SQLite storage), las comillas no son peligrosas porque no hay ejecucion de shell.

---

### Issue 5: SettingsManager No Valida Hooks Profundamente

**Archivo**: `src/electron/libs/settings-manager.ts:147-152`
**CWE**: CWE-20 (Improper Input Validation)

**Solucion**:

```typescript
private isValidHookConfig(config: unknown): config is HookConfig {
  if (typeof config !== "object" || config === null) return false;
  const c = config as Record<string, unknown>;

  // Validate matcher (required string)
  if (typeof c.matcher !== "string") return false;

  // Validate hooks array
  if (!Array.isArray(c.hooks)) return false;

  for (const hook of c.hooks) {
    if (typeof hook !== "object" || hook === null) return false;
    const h = hook as Record<string, unknown>;
    if (typeof h.command !== "string") return false;
    if (h.timeout !== undefined && typeof h.timeout !== "number") return false;
    if (h.type !== "command") return false;
  }

  return true;
}

private validateSettings(input: unknown): GlobalSettings {
  // ... existing code ...

  // Validate hooks (deep validation)
  if (obj.hooks !== undefined) {
    if (typeof obj.hooks !== "object" || obj.hooks === null) {
      throw new Error("hooks must be an object");
    }
    validated.hooks = {};
    for (const [event, eventHooks] of Object.entries(obj.hooks as Record<string, unknown>)) {
      if (!Array.isArray(eventHooks)) continue;
      const validHooks = eventHooks.filter(h => this.isValidHookConfig(h));
      if (validHooks.length > 0) {
        validated.hooks[event] = validHooks as HookConfig[];
      }
    }
  }
}
```

---

### Issue 6: Singleton resetInstance() Publicamente Expuesto

**Archivo**: `src/electron/libs/settings-manager.ts:315-317`

**Solucion**:

```typescript
/**
 * Reset singleton instance (INTERNAL USE ONLY - for testing)
 * @internal This method should only be used in test environments
 */
static resetInstance(): void {
  if (process.env.NODE_ENV !== "test") {
    console.warn("[SETTINGS-MANAGER] resetInstance() called outside test environment");
  }
  SettingsManager.instance = null;
}
```

Alternativa: Hacer el metodo privado y exponer solo para tests via un patron de testing.

---

## Fase 3: Issues de Media Prioridad (P2)

### Issue 7: Rate Limiting en IPC Handlers

**Archivo**: `src/electron/ipc-handlers.ts`

**Solucion** - Simple rate limiter:

```typescript
// Rate limiter simple para IPC
const rateLimiter = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // max requests
const RATE_WINDOW = 60000; // per minute

function checkRateLimit(eventType: string): boolean {
  const now = Date.now();
  const key = eventType;
  const current = rateLimiter.get(key);

  if (!current || now > current.resetAt) {
    rateLimiter.set(key, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (current.count >= RATE_LIMIT) {
    console.warn(`[IPC] Rate limit exceeded for ${eventType}`);
    return false;
  }

  current.count++;
  return true;
}

export function handleClientEvent(event: ClientEvent) {
  // Rate limiting
  if (!checkRateLimit(event.type)) {
    emit({
      type: "runner.error",
      payload: { message: "Rate limit exceeded. Please wait." }
    });
    return;
  }

  // ... existing handlers ...
}
```

---

### Issue 8: Timeout en pendingPermissions

**Archivo**: `src/electron/libs/runner.ts:97-114`

**Solucion**:

```typescript
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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

  // Timeout handler
  const timeoutId = setTimeout(() => {
    if (session.pendingPermissions.has(toolUseId)) {
      session.pendingPermissions.delete(toolUseId);
      console.warn(`[RUNNER] Permission request ${toolUseId} timed out`);
      resolve({ behavior: "deny", message: "Permission request timed out" });
    }
  }, PERMISSION_TIMEOUT_MS);

  // Handle abort (clear timeout)
  signal.addEventListener("abort", () => {
    clearTimeout(timeoutId);
    session.pendingPermissions.delete(toolUseId);
    resolve({ behavior: "deny", message: "Session aborted" });
  });
});
```

---

### Issue 9: CI Workflow continue-on-error para ESLint

**Archivo**: `.github/workflows/ci.yml:27`

**Solucion**:

```yaml
- name: Run ESLint
  run: bun run lint
  # Fail on PRs to main, warn on feature branches
  continue-on-error: ${{ github.event_name == 'push' && github.ref != 'refs/heads/main' }}
```

Esto:
- Falla en PRs (siempre)
- Falla en push a main
- Permite continuar en push a feature branches (warning)

---

## Fase 4: Issues de Baja Prioridad (P3) - Backlog

### Issue 10: Comentarios de Seguridad Inconsistentes

Estandarizar formato:
```typescript
// SECURITY [CWE-XXX]: Descripcion breve
// Mitigacion: Como se resuelve
```

### Issue 11: JSDoc en Funciones Exportadas

Agregar JSDoc a todas las funciones `export function`:
- Descripcion
- @param para cada parametro
- @returns descripcion del retorno
- @throws condiciones de error
- @security para funciones con implicaciones de seguridad

### Issue 12: Duplicacion en loadProviders/loadProvidersSafe

Refactorizar a una funcion base:

```typescript
function loadProvidersRaw(): LlmProviderConfig[] {
  try {
    if (existsSync(PROVIDERS_FILE)) {
      const raw = readFileSync(PROVIDERS_FILE, "utf8");
      const providers = JSON.parse(raw) as LlmProviderConfig[];
      if (!Array.isArray(providers)) return [];
      return providers;
    }
  } catch {
    // Ignore
  }
  return [];
}

export function loadProviders(): LlmProviderConfig[] {
  return loadProvidersRaw().map(decryptSensitiveData);
}

export function loadProvidersSafe(): SafeProviderConfig[] {
  return loadProvidersRaw().map(p => toSafeProvider(p));
}
```

---

## Resumen de Archivos a Modificar

| Archivo | Issues | Prioridad |
|---------|--------|-----------|
| `src/electron/libs/provider-config.ts` | 1, 2, 3, 12 | P0, P0, P1, P3 |
| `src/electron/libs/session-store.ts` | 4 | P1 |
| `src/electron/libs/settings-manager.ts` | 5, 6 | P1, P1 |
| `src/electron/libs/runner.ts` | 8 | P2 |
| `src/electron/ipc-handlers.ts` | 7 | P2 |
| `.github/workflows/ci.yml` | 9 | P2 |
| `CUSTOM_PROVIDERS.md` | 1 (docs) | P0 |

---

## Orden de Ejecucion Recomendado

```
FASE 1 (P0) → Merge Blocker
├── Fix 1: SSRF localhost flag
├── Fix 2: Magic prefix para tokens
└── Update: CUSTOM_PROVIDERS.md

FASE 2 (P1) → Pre-release
├── Fix 3: Validacion de models
├── Fix 4: sanitizePath sin shell chars
├── Fix 5: Deep hook validation
└── Fix 6: resetInstance warning

FASE 3 (P2) → Next Sprint
├── Fix 7: Rate limiting IPC
├── Fix 8: Permission timeout
└── Fix 9: CI ESLint logic

FASE 4 (P3) → Backlog
├── Fix 10: Security comments
├── Fix 11: JSDoc docs
└── Fix 12: Duplicacion refactor
```

---

## Criterios de Completitud

- [ ] Todos los issues P0 resueltos
- [ ] Todos los issues P1 resueltos
- [ ] Tests agregados para fixes de seguridad
- [ ] Documentacion actualizada (CUSTOM_PROVIDERS.md)
- [ ] CI pasa sin `continue-on-error`
- [ ] Review de seguridad adversarial completado

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|--------------|---------|------------|
| Migracion de tokens rompe providers existentes | Media | Alto | Backward compatible con tokens sin prefijo |
| Cambio en sanitizePath causa regresion | Baja | Medio | Tests exhaustivos, flag `forShellExecution` |
| Rate limiting muy agresivo | Baja | Bajo | Limites conservadores (100/min), facil de ajustar |

---

## Preguntas para el Usuario

Antes de proceder, necesito confirmar:

1. **Prioridad de ejecucion**: Quieres que proceda solo con P0/P1, o incluir tambien P2?

2. **Variable de entorno para localhost**: El nombre `CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS` es aceptable, o prefieres otro?

3. **Worktree aislado**: Dado que son fixes de seguridad, recomiendo crear un worktree. Procedo con `ralph worktree "pr26-security-fixes"`?

4. **Tests**: Quieres tests unitarios para cada fix, o solo para los criticos (P0)?
