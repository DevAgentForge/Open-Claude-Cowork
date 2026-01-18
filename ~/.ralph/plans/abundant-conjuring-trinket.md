# Plan: Comprehensive Code Review Remediation - PRD Completo

**Plan ID**: abundant-conjuring-trinket
**Generated**: 2026-01-18
**Complexity**: 8/10
**Model**: sonnet
**Adversarial**: Required
**Branch**: fix/electron-windows

---

## TABLA DE CONTENIDOS

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Inventario Completo de Hallazgos](#2-inventario-completo-de-hallazgos)
3. [Fase 1: Critical Security Fixes](#3-fase-1-critical-security-fixes)
4. [Fase 2: High Priority Security & Correctness](#4-fase-2-high-priority-security--correctness)
5. [Fase 3: Medium Priority Issues](#5-fase-3-medium-priority-issues)
6. [Fase 4: Low Priority & Cleanup](#6-fase-4-low-priority--cleanup)
7. [Strategy de Testing](#7-strategy-de-testing)
8. [Criterios de Exito](#8-criterios-de-exito)
9. [Procedimientos de Rollback](#9-procedimientos-de-rollback)
10. [Estimacion de Esfuerzo](#10-estimacion-de-esfuerzo)

---

## 1. Resumen Ejecutivo

### 1.1 Contexto del Proyecto

**Open Claude Cowork** es una aplicacion Electron que proporciona una interfaz GUI para Claude Code. El proyecto utiliza:
- **Framework**: Electron 39
- **Frontend**: React 19, Tailwind CSS 4
- **State Management**: Zustand
- **Database**: better-sqlite3 (WAL mode)
- **AI SDK**: @anthropic-ai/claude-agent-sdk
- **Build**: Vite 7, electron-builder
- **Runtime**: Bun (preferred) o Node.js 18+

### 1.2 Resumen de la Revision

Se ejecuto una revision completa utilizando multiples agentes de review:

| Skill/Agent | Proposito | Resultado |
|-------------|-----------|-----------|
| `/code-reviewer` | Code quality, bugs, race conditions | OK |
| `/security-loop` | Vulnerabilidades, injection, auth | OK |
| `/comprehensive-review:full-review` | AI-style patterns, funcionalidad completa | OK |
| `quality-auditor` | Correctness, security, simplicity | OK |
| `security-auditor` | Vulnerabilidades CWE | OK |
| `code-simplicity-reviewer` | YAGNI, duplicacion, complejidad | OK |
| `architecture-strategist` | SOLID, coupling, boundaries | OK |

### 1.3 Estadisticas de Hallazgos

| Categoria | Critico | Alto | Medio | Bajo |
|-----------|---------|------|-------|------|
| Seguridad | 1 | 3 | 4 | 2 |
| Correctitud | 0 | 2 | 3 | 2 |
| Arquitectura | 0 | 1 | 3 | 2 |
| Simplicidad | 0 | 0 | 2 | 3 |
| **TOTAL** | **1** | **3** | **8** | **6** |

### 1.4 Top 5 Issues Prioritarios

1. **[CRITICO]** Log injection en `provider-config.ts:370`
2. **[ALTO]** Token como variable de entorno en `provider-config.ts:397`
3. **[ALTO]** Race condition potencial en `session-store.ts:314`
4. **[ALTO]** Memory leak en `runner.ts:168`
5. **[ALTO]** Acoplamiento excesivo entre `runner.ts` y `provider-config.ts`

### 1.5 Veredicto General

**APROBADO CON CONDICIONES**

El codigo esta listo para produccion pero con debt tecnico que debe abordarse:
- **Semana 1**: Fix de 1 critico + 3 altos
- **Semana 2**: Refactorizacion de arquitectura
- **Backlog**: Issues medios y bajos

---

## 2. Inventario Completo de Hallazgos

### 2.1 CRITICAL (1)

| ID | Archivo | Linea | Issue | CWE | Tiempo Estimado |
|----|---------|-------|-------|-----|-----------------|
| SEC-001 | provider-config.ts | 370 | Log injection vulnerability | CWE-117 | 15 min |

### 2.2 HIGH (3)

| ID | Archivo | Linea | Issue | CWE | Tiempo Estimado |
|----|---------|-------|-------|-----|-----------------|
| SEC-002 | provider-config.ts | 397 | Token as environment variable exposure | CWE-200 | 30 min |
| QUAL-001 | session-store.ts | 314 | Race condition in exception handling | CWE-362 | 45 min |
| QUAL-002 | runner.ts | 168 | Memory leak in pendingPermissions Map | CWE-400 | 30 min |

### 2.3 MEDIUM (8)

| ID | Archivo | Linea | Issue | CWE | Tiempo Estimado |
|----|---------|-------|-------|-----|-----------------|
| SEC-003 | provider-config.ts | 283 | Model config validation too permissive | CWE-20 | 30 min |
| SEC-004 | provider-config.ts | 110 | Error messages with sensitive info | CWE-209 | 15 min |
| SEC-005 | provider-config.ts | 249 | File permissions window (TOCTOU) | CWE-276 | 20 min |
| SEC-006 | provider-config.ts | 27 | SSRF bypass via env var manipulation | CWE-918 | 15 min |
| QUAL-003 | ipc-handlers.ts | 71 | IPC handlers violate SRP | N/A | 1 hora |
| SIMP-001 | provider-config.ts | 330 | Nested ternary hard to read | N/A | 20 min |
| SIMP-002 | session-store.ts | 146 | JSON parsing duplication | N/A | 30 min |
| ARCH-001 | runner.ts / provider-config.ts | - | Credential coupling violates SRP | N/A | 2 horas |

### 2.4 LOW (6)

| ID | Archivo | Linea | Issue | CWE | Tiempo Estimado |
|----|---------|-------|-------|-----|-----------------|
| SEC-007 | main.ts | 13 | Hardcoded path for SDK | N/A | 15 min |
| QUAL-004 | ipc-handlers.ts | 54 | Implicit any type annotation | N/A | 10 min |
| ARCH-002 | types.ts | - | No runtime schema validation | N/A | 2 horas |
| ARCH-005 | unified-commands.ts | 20 | Global state in static Map | N/A | 30 min |
| ARCH-006 | claude-settings.ts | 22 | Hardcoded paths for node version managers | N/A | 20 min |
| SIMP-004 | provider-config.ts | 120 | Dead code (legacy migration function) | N/A | 10 min |

---

## 3. Fase 1: Critical Security Fixes

### SEC-001: Log Injection Vulnerability

#### 3.1.1 Localizacion Exacta del Problema

**Archivo**: `src/electron/libs/provider-config.ts`
**Linea**: 370

```typescript
// Linea 364-384: Funcion completa
export function getProviderEnvById(providerId: string): Record<string, string> | null {
  // Check if it's a default provider template
  if (providerId.startsWith("template_")) {
    const templateId = providerId.replace("template_", "");
    const defaultProvider = getDefaultProvider(templateId);
    if (defaultProvider) {
      console.log(`[ProviderConfig] Using default provider template: ${templateId}`); // <-- LINEA 370
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
```

#### 3.1.2 Analisis del Problema

**CWE**: CWE-117 - Improper Output Neutralization for Logs

El problema radica en que `templateId` (proveniente del `providerId` que viene del renderer process) se inserta directamente en el string del log sin ninguna sanitizacion.

**Vector de Ataque Potencial**:
1. Un atacante compromete el renderer process
2. Envia un `providerId` malicioso como `template_A\n[COMPROMISED] User logged in`
3. El log queda污染ado (contaminated) con datos controlados por el atacante
4. Si los logs se procesan automaticamente por sistemas SIEM/SOAR, podrian ejecutar acciones basadas en el contenido injectado

**Caracteres Peligrosos**:
- `\n` (newline) - Permite injectar nuevas lineas
- `\r` (carriage return) - Permite injectar nuevas lineas
- `\t` (tab) - Puede alterar formato tabular
- `\x00` (null byte) - Puede truncar logs
- Caracteres ANSI escape - Pueden alterar color/formato

#### 3.1.3 Solucion Detallada

**Paso 1: Crear funcion helper de sanitizacion**

```typescript
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
  return value.replace(/[\x00-\x1f\x7f]/g, "_");
}

// Alternative: Even more restrictive - allow only safe printable characters
function sanitizeForLogStrict(value: string): string {
  // Remove any character that's not a printable ASCII character (32-126)
  // This is safer but may be too restrictive for some use cases
  return value.replace(/[^\x20-\x7e]/g, "_");
}
```

**Paso 2: Modificar la linea problematico**

```typescript
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
```

**Paso 3: Añadir tests**

```typescript
// En provider-config.test.ts
describe("sanitizeForLog", () => {
  it("should replace newlines with underscores", () => {
    expect(sanitizeForLog("hello\nworld")).toBe("hello_world");
  });

  it("should replace carriage returns with underscores", () => {
    expect(sanitizeForLog("hello\rworld")).toBe("hello_world");
  });

  it("should replace tabs with underscores", () => {
    expect(sanitizeForLog("hello\tworld")).toBe("hello_world");
  });

  it("should replace null bytes with underscores", () => {
    expect(sanitizeForLog("hello\x00world")).toBe("hello_world");
  });

  it("should replace all control characters", () => {
    const input = "line1\nline2\rline3\tline4\x00line5";
    const output = sanitizeForLog(input);
    expect(output).toBe("line1_line2_line3_line4_line5");
  });

  it("should not modify normal strings", () => {
    expect(sanitizeForLog("Hello World 123")).toBe("Hello World 123");
  });

  it("should handle empty string", () => {
    expect(sanitizeForLog("")).toBe("");
  });

  it("should handle special characters that are safe", () => {
    expect(sanitizeForLog("hello@example.com")).toBe("hello@example.com");
    expect(sanitizeForLog("path/to/file")).toBe("path/to/file");
  });
});
```

#### 3.1.4 Archivos Afectados

| Archivo | Tipo de Cambio | Lineas |
|---------|----------------|--------|
| `src/electron/libs/provider-config.ts` | Añadir funcion + modificar | 1-15 (nueva funcion), 370 (modificada) |

#### 3.1.5 Verificacion

1. Compilar TypeScript: `bun run build`
2. Ejecutar tests: `bun test`
3. Verificar que el log muestra el templateId sanitizado
4. Probar con templateIds maliciosos para confirmar sanitizacion

#### 3.1.6 Procedimiento de Rollback

```bash
# Si hay problemas, revertir con:
git checkout HEAD -- src/electron/libs/provider-config.ts
```

---

## 4. Fase 2: High Priority Security & Correctness

### SEC-002: Token as Environment Variable Exposure

#### 4.2.1 Localizacion Exacta del Problema

**Archivo**: `src/electron/libs/provider-config.ts`
**Lineas**: 397-399

```typescript
// Lineas 390-418: Funcion completa
export function getProviderEnv(provider: LlmProviderConfig): Record<string, string> {
  const env: Record<string, string> = {};

  if (provider.baseUrl) {
    env.ANTHROPIC_BASE_URL = provider.baseUrl;
  }

  if (provider.authToken) {
    env.ANTHROPIC_AUTH_TOKEN = provider.authToken; // <-- LINEA 397-399
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
```

#### 4.2.2 Analisis del Problema

**CWE**: CWE-200 - Exposure of Sensitive Information to an Unauthorized Actor

El token se pasa como variable de entorno al proceso hijo (Claude SDK). Las variables de entorno son visibles en multiples lugares:

**Linux/Unix**:
```bash
# Cualquier usuario puede ver las variables de otros procesos
cat /proc/<pid>/environ | tr '\0' '\n' | grep ANTHROPIC

# o usando ps
ps auxww | grep <process_name>
```

**macOS**: Similar a Linux, con instrumentos de profiling

**Windows**:
```cmd
# Via WMI
wmic process where "processid=<PID>" get commandline

# Via procexp
Process Explorer puede mostrar variables de entorno
```

**Herramientas de Debugging/Profiling**:
- Chrome DevTools
- Electron crash reporter
-第三方 profiling tools

#### 4.2.3 Soluciones Propuestas

**OPCION A: IPC con Pipe Encriptado (Mas Seguro)**

```typescript
// En runner.ts
import { ipcRenderer } from "electron";

// En lugar de pasar token como env var, usar IPC
const token = await ipcRenderer.invoke("get-provider-token", providerId);

// El token viene encriptado via IPC channel
// Main process desencripta y retorna
```

**Ventajas**:
- Token nunca aparece en /proc/<pid>/environ
- Protegido por el sandbox de Electron IPC
- Mas dificil de extraer por第三方 herramientas

**Desventajas**:
- Requiere cambios en la arquitectura del SDK
- Potencial race condition si el proceso hijo intenta leer antes de que se envie

**OPCION B: Feature Flag con Documentacion (Backwards Compatible)**

```typescript
// En provider-config.ts
const USE_SECURE_TOKEN_HANDLING = process.env.CLAUDE_COWORK_SECURE_TOKEN === "true";

export function getProviderEnv(provider: LlmProviderConfig, includeToken = true): Record<string, string> {
  const env: Record<string, string> = {};

  if (provider.baseUrl) {
    env.ANTHROPIC_BASE_URL = provider.baseUrl;
  }

  // Only include token if explicitly enabled and requested
  if (includeToken && provider.authToken && !USE_SECURE_TOKEN_HANDLING) {
    env.ANTHROPIC_AUTH_TOKEN = provider.authToken;
  }

  // ... rest of function
}
```

**OPCION C: Pipe Unix Anonimo (Linux/macOS)**

```typescript
import { spawn } from "child_process";
import * as net from "net";

// Crear par de pipes
const [pipeRead, pipeWrite] = net.socketpair();

// Pasar el write end al proceso hijo como fd
const child = spawn("claude-agent", args, {
  stdio: ["pipe", "pipe", "pipe", "pipe", pipeRead], // fd 4 = pipe
  env: { ...env, ANTHROPIC_AUTH_TOKEN: undefined } // No incluir token
});

// Escribir token al pipe
pipeWrite.write(JSON.stringify({ token: provider.authToken }));
```

#### 4.2.4 Recomendacion: Implementar Opcion B con Hoja de Ruta

Para mantener backwards compatibility mientras se implementa una solucion mas robusta:

```typescript
// provider-config.ts

/**
 * Token handling mode configuration
 * - "env-var": Traditional method (token in environment variable) - default for backwards compatibility
 * - "ipc": Token passed via encrypted IPC channel - recommended for production
 * - "prompt": Token prompted from user each time - most secure but least convenient
 */
type TokenHandlingMode = "env-var" | "ipc" | "prompt";

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

/**
 * Get environment variables for a specific provider configuration.
 * This allows overriding the default Claude Code settings with custom provider settings.
 *
 * @param provider - The provider configuration
 * @param options - Optional configuration for token handling
 * @returns Environment variables to set for the provider
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
```

#### 4.2.5 Implementacion del Handler IPC

```typescript
// En ipc-handlers.ts, anadir nuevo handler
ipcMainHandle("get-provider-token", async (_: Electron.IpcMainInvokeEvent, providerId: string) => {
  const provider = getProvider(providerId);
  if (!provider || !provider.authToken) {
    return null;
  }

  // Encrypt token before sending to renderer
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(provider.authToken);
    return {
      encrypted: true,
      data: encrypted.toString("base64")
    };
  }

  // Fallback for systems without encryption
  return {
    encrypted: false,
    data: provider.authToken
  };
});
```

#### 4.2.6 Documentacion de Migracion

```markdown
## Token Handling Modes

### Environment Variable Mode (Default, Legacy)

```typescript
process.env.CLAUDE_COWORK_TOKEN_HANDLING = "env-var"; // or unset
```

The token is passed as an environment variable (`ANTHROPIC_AUTH_TOKEN`) to the Claude SDK process.

**Security Implications:**
- Token visible in `/proc/<pid>/environ` on Linux
- Visible in process listing tools (ps, htop, etc.)
- May be captured by debugging/profiling tools

**Use Case:** Development environments, testing

### IPC Mode (Recommended for Production)

```typescript
process.env.CLAUDE_COWORK_TOKEN_HANDLING = "ipc";
```

The token is passed via an encrypted IPC channel between the main process and the Claude SDK subprocess.

**Security Improvements:**
- Token never appears in environment variables
- Protected by Electron's IPC security model
- Cannot be read by process listing tools

**Requirements:**
- Claude SDK version supporting IPC token mode
- Electron main process must be running

### Prompt Mode (Most Secure)

```typescript
process.env.CLAUDE_COWORK_TOKEN_HANDLING = "prompt";
```

The user is prompted for the token each time a session starts.

**Security Benefits:**
- Token never stored in memory longer than necessary
- No persistent token in environment
- User must authorize each session

**Drawbacks:**
- Less convenient for frequent use
- Requires user interaction
```

#### 4.2.7 Archivos Afectados

| Archivo | Tipo de Cambio | Lineas |
|---------|----------------|--------|
| `src/electron/libs/provider-config.ts` | Modificar funcion | 390-418 |
| `src/electron/libs/provider-config.ts` | Anadir funciones nuevas | 1-50 (nuevas) |
| `src/electron/ipc-handlers.ts` | Anadir handler IPC | ~10 lineas |
| `src/electron/libs/runner.ts` | Modificar llamada | ~5 lineas |

---

### QUAL-001: Race Condition in Exception Handling

#### 4.3.1 Localizacion Exacta del Problema

**Archivo**: `src/electron/libs/session-store.ts`
**Lineas**: 314-331

```typescript
// Lineas 314-346: Funcion completa
private loadSessions(): void {
  const rows = this.db
    .prepare(
      `select id, title, claude_session_id, status, cwd, allowed_tools, last_prompt, permission_mode
       from sessions`
    )
    .all();
  for (const row of rows as Array<Record<string, unknown>>) {
    // Re-validate cwd on load (security: CWE-22)
    // If path is invalid/deleted, set to undefined rather than crash
    let validatedCwd: string | undefined;
    if (row.cwd) {
      try {
        validatedCwd = this.sanitizePath(String(row.cwd));
      } catch {
        // Path no longer valid (deleted/moved), clear it
        validatedCwd = undefined; // <-- SILENTLY DROPS ERROR
      }
    }

    const session: Session = {
      id: String(row.id),
      title: String(row.title),
      claudeSessionId: row.claude_session_id ? String(row.claude_session_id) : undefined,
      status: row.status as SessionStatus,
      cwd: validatedCwd,
      allowedTools: row.allowed_tools ? String(row.allowed_tools) : undefined,
      lastPrompt: row.last_prompt ? String(row.last_prompt) : undefined,
      permissionMode: row.permission_mode ? (row.permission_mode as PermissionMode) : undefined,
      pendingPermissions: new Map()
    };
    this.sessions.set(session.id, session);
  }
}
```

#### 4.3.2 Analisis del Problema

**CWE**: CWE-362 - Concurrent Execution using Shared Resource with Improper Synchronization

El problema no es exactamente un race condition en el sentido clasico de concurrencia, sino mas bien:

1. **Silent Error Suppression**: El bloque `catch {}` vacio suprime toda informacion sobre por que falló la validacion del path

2. **Silent Data Loss**: Si el path es invalido por razones legitimas (directorio eliminado, permisos cambiados), el usuario no es notificado

3. **Potential Null Dereference**: Codigo cliente podria asumir que `session.cwd` siempre esta definido si se cargo de la base de datos

**Escenarios Problematicos**:
- Directorio fue movido a otra ubicacion
- Permisos del directorio fueron revocados
- El path contiene caracteres especiales que fallan en ciertas plataformas
- Race condition real si multiple threads acceden a la vez

#### 4.3.3 Solucion Detallada

```typescript
/**
 * Load sessions from database with robust error handling
 *
 * SECURITY NOTE: Paths are re-validated on load to prevent CWE-22 (Path Traversal)
 * Invalid paths are cleared but the session is preserved for user review.
 */
private loadSessions(): void {
  const rows = this.db
    .prepare(
      `select id, title, claude_session_id, status, cwd, allowed_tools, last_prompt, permission_mode
       from sessions`
    )
    .all();

  let invalidPathCount = 0;
  const invalidSessionIds: string[] = [];

  for (const row of rows as Array<Record<string, unknown>>) {
    // Re-validate cwd on load (security: CWE-22)
    // If path is invalid/deleted, set to undefined and log the issue
    let validatedCwd: string | undefined;
    let pathLoadError: Error | null = null;
    let originalCwd: string | null = null;

    if (row.cwd) {
      originalCwd = String(row.cwd);
      try {
        validatedCwd = this.sanitizePath(originalCwd);
      } catch (error) {
        // Log the error for debugging but don't crash
        // The path may have been deleted, moved, or had permissions changed
        pathLoadError = error instanceof Error ? error : new Error(String(error));

        // eslint-disable-next-line no-console
        console.warn(
          `[SessionStore] Session ${String(row.id)} has invalid cwd path, skipping validation`,
          {
            sessionId: String(row.id),
            originalPath: originalCwd,
            error: pathLoadError.message
          }
        );

        validatedCwd = undefined;
      }
    }

    const session: Session = {
      id: String(row.id),
      title: String(row.title),
      claudeSessionId: row.claude_session_id ? String(row.claude_session_id) : undefined,
      status: row.status as SessionStatus,
      cwd: validatedCwd,
      // Track if this session has an invalid cwd
      allowedTools: row.allowed_tools ? String(row.allowed_tools) : undefined,
      lastPrompt: row.last_prompt ? String(row.last_prompt) : undefined,
      permissionMode: row.permission_mode ? (row.permission_mode as PermissionMode) : undefined,
      pendingPermissions: new Map()
    };

    // If path was invalid, mark session as needing attention
    if (pathLoadError) {
      session.status = "error";
      invalidPathCount++;
      invalidSessionIds.push(session.id);
    }

    this.sessions.set(session.id, session);
  }

  // Log summary of any path issues
  if (invalidPathCount > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[SessionStore] Loaded ${rows.length} sessions, ${invalidPathCount} had invalid cwd paths`,
      { invalidSessionIds }
    );
  }
}

/**
 * Result type for path validation with detailed information
 */
type PathValidationResult = {
  valid: boolean;
  path?: string;
  error?: string;
  isRecoverable: boolean;
};

/**
 * Validate and sanitize a path with detailed error information
 * @internal
 */
private validateAndSanitizePath(inputPath: string | null | undefined): PathValidationResult {
  if (!inputPath) {
    return { valid: true, path: undefined, isRecoverable: true };
  }

  const pathString = String(inputPath);

  if (pathString.length === 0) {
    return { valid: true, path: undefined, isRecoverable: true };
  }

  try {
    const sanitized = this.sanitizePath(pathString);
    return { valid: true, path: sanitized, isRecoverable: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Determine if the error is recoverable
    const isRecoverable = !errorMessage.includes("dangerous shell metacharacters");

    return {
      valid: false,
      path: undefined,
      error: errorMessage,
      isRecoverable
    };
  }
}
```

#### 4.3.4 Tests Requeridos

```typescript
describe("SessionStore.loadSessions", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("should load valid sessions successfully", () => {
    // Create session with valid cwd
    const session = store.createSession({
      cwd: __dirname,
      title: "Test Session"
    });

    // Close and reopen store
    store.close();
    store = new SessionStore(":memory:");

    const sessions = store.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].cwd).toBe(__dirname);
  });

  it("should handle session with deleted cwd gracefully", () => {
    // Create session
    const session = store.createSession({
      cwd: "/tmp/test-directory-that-will-be-deleted",
      title: "Test Session"
    });

    // Delete the directory (simulating deleted path)
    // ... test would need to actually delete

    // Close and reopen store
    store.close();
    store = new SessionStore(":memory:");

    const sessions = store.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("error"); // Should be marked as error
  });

  it("should log warning when cwd is invalid", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Create session directly in DB with invalid path
    const db = (store as any).db;
    db.prepare(
      `insert into sessions (id, title, status, cwd, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?)`
    ).run("test-session", "Test", "idle", "/nonexistent/path", Date.now(), Date.now());

    // Close and reopen to trigger loadSessions
    store.close();
    store = new SessionStore(":memory:");

    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(consoleWarnSpy.mock.calls[0][0]).toContain("invalid cwd");

    consoleWarnSpy.mockRestore();
  });

  it("should preserve session even when cwd is invalid", () => {
    // Create session directly in DB with invalid path
    const db = (store as any).db;
    db.prepare(
      `insert into sessions (id, title, status, cwd, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?)`
    ).run("test-session", "Test Session", "idle", "/invalid/path", Date.now(), Date.now());

    // Close and reopen
    store.close();
    store = new SessionStore(":memory:");

    // Session should still be loadable
    const sessions = store.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe("test-session");
    expect(sessions[0].title).toBe("Test Session");
  });
});
```

#### 4.3.5 Archivos Afectados

| Archivo | Tipo de Cambio | Lineas |
|---------|----------------|--------|
| `src/electron/libs/session-store.ts` | Modificar loadSessions | 314-346 |
| `src/electron/libs/session-store.ts` | Anadir PathValidationResult | 1-30 |

---

### QUAL-002: Memory Leak in pendingPermissions Map

#### 4.4.1 Localizacion Exacta del Problema

**Archivo**: `src/electron/libs/runner.ts`
**Lineas**: 165-190

```typescript
// Lineas 120-192: Contexto completo
type PermissionRequestContext = {
  session: Session;
  sendPermissionRequest: (toolUseId: string, toolName: string, input: unknown) => void;
  permissionMode: PermissionMode;
  allowedTools: Set<string> | null;
};

export function createCanUseTool({
  session,
  sendPermissionRequest,
  permissionMode,
  allowedTools
}: PermissionRequestContext) {
  return async (toolName: string, input: unknown, { signal }: { signal: AbortSignal }) => {
    const isAskUserQuestion = toolName === "AskUserQuestion";

    // FREE mode: auto-approve all tools except AskUserQuestion
    if (!isAskUserQuestion && permissionMode === "free") {
      if (!isToolAllowed(toolName, allowedTools)) {
        return {
          behavior: "deny",
          message: `Tool ${toolName} is not allowed by allowedTools restriction`
        } as PermissionResult;
      }
      return { behavior: "allow", updatedInput: input } as PermissionResult;
    }

    // SECURE mode: check allowedTools and require user approval
    if (!isToolAllowed(toolName, allowedTools)) {
      return {
        behavior: "deny",
        message: `Tool ${toolName} is not allowed by allowedTools restriction`
      } as PermissionResult;
    }

    // Request user permission
    const toolUseId = crypto.randomUUID();
    sendPermissionRequest(toolUseId, toolName, input);

    return new Promise<PermissionResult>((resolve) => {
      // Set timeout to prevent indefinite waiting
      const timeoutId = setTimeout(() => {
        session.pendingPermissions.delete(toolUseId); // <-- Cleanup only on timeout
        console.warn(`[Runner] Permission request timed out for tool ${toolName} (${toolUseId})`);
        resolve({ behavior: "deny", message: "Permission request timed out after 5 minutes" });
      }, PERMISSION_TIMEOUT_MS);

      session.pendingPermissions.set(toolUseId, {
        toolUseId,
        toolName,
        input,
        resolve: (result) => {
          clearTimeout(timeoutId);
          session.pendingPermissions.delete(toolUseId); // <-- Cleanup on resolve
          resolve(result as PermissionResult);
        }
      });

      // Handle abort
      signal.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        session.pendingPermissions.delete(toolUseId); // <-- Cleanup on abort
        resolve({ behavior: "deny", message: "Session aborted" });
      });
    });
  };
}
```

#### 4.4.2 Analisis del Problema

**CWE**: CWE-400 - Uncontrolled Resource Consumption

El `session.pendingPermissions` es un Map que mantiene referencias. Aunque hay cleanup en tres casos (timeout, resolve, abort), hay escenarios donde el cleanup NO ocurre:

**Escenarios de Leak**:
1. **Crash del proceso principal**: El timeout nunca se ejecuta
2. **Session leak**: La session nunca se limpia completamente
3. **GC retention**: Referencias fuertes en el Map previenen garbage collection
4. **Permisos denied sin cleanup**: Si `sendPermissionRequest` falla, el entry queda huérfano

**Calculo de Leak Potential**:
- Timeout: 5 minutos = 300 segundos
- Max requests por minuto: 20 (rate limit)
- Entries maximos en Map: 20 * 5 = 100 entries maximos
- Con sesiones largas (8 horas): 20 * 60 * 8 = 9600 entries potenciales

#### 4.4.3 Solucion Detallada

```typescript
/**
 * Configuration for pending permissions management
 */
interface PendingPermissionsConfig {
  /** Maximum number of pending permissions before forcing cleanup */
  maxPendingPermissions: number;
  /** Timeout for permission requests in milliseconds */
  permissionTimeoutMs: number;
  /** Interval for periodic cleanup of stale entries */
  cleanupIntervalMs: number;
  /** Age threshold for considering an entry stale */
  staleThresholdMs: number;
}

const DEFAULT_PENDING_PERMISSIONS_CONFIG: PendingPermissionsConfig = {
  maxPendingPermissions: 100,
  permissionTimeoutMs: 5 * 60 * 1000, // 5 minutes
  cleanupIntervalMs: 60 * 1000, // 1 minute
  staleThresholdMs: 10 * 60 * 1000 // 10 minutes
};

/**
 * Entry for tracking pending permission requests
 * @internal
 */
interface PendingPermissionEntry {
  toolUseId: string;
  toolName: string;
  input: unknown;
  resolve: (result: PermissionResult) => void;
  createdAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Create a canUseTool function with memory leak prevention
 * - Limits maximum pending permissions
 * - Periodic cleanup of stale entries
 * - Proper cleanup on all exit paths
 */
export function createCanUseTool(
  context: PermissionRequestContext,
  config: Partial<PendingPermissionsConfig> = {}
): (toolName: string, input: unknown, options: { signal: AbortSignal }) => Promise<PermissionResult> {
  const { session, sendPermissionRequest, permissionMode, allowedTools } = context;
  const fullConfig = { ...DEFAULT_PENDING_PERMISSIONS_CONFIG, ...config };

  // Track cleanup interval for periodic maintenance
  let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Cleanup a single permission entry
   */
  function cleanupEntry(toolUseId: string, entry: PendingPermissionEntry | undefined): void {
    if (entry) {
      clearTimeout(entry.timeoutId);
      session.pendingPermissions.delete(toolUseId);
    }
  }

  /**
   * Periodic cleanup of stale entries
   */
  function startPeriodicCleanup(): void {
    cleanupIntervalId = setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [toolUseId, entry] of session.pendingPermissions) {
        if (entry.createdAt < now - fullConfig.staleThresholdMs) {
          // Entry is stale - cleanup
          console.warn(
            `[Runner] Cleaning up stale permission request: ${entry.toolName} (${toolUseId})`
          );
          cleanupEntry(toolUseId, entry);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        // eslint-disable-next-line no-console
        console.log(`[Runner] Cleaned up ${cleanedCount} stale permission entries`);
      }
    }, fullConfig.cleanupIntervalMs);
  }

  /**
   * Stop periodic cleanup
   */
  function stopPeriodicCleanup(): void {
    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId);
      cleanupIntervalId = null;
    }
  }

  // Start periodic cleanup when first permission is requested
  let cleanupStarted = false;

  return async (toolName: string, input: unknown, { signal }: { signal: AbortSignal }) => {
    // Start periodic cleanup on first use
    if (!cleanupStarted) {
      startPeriodicCleanup();
      cleanupStarted = true;
    }

    const isAskUserQuestion = toolName === "AskUserQuestion";

    // FREE mode: auto-approve all tools except AskUserQuestion
    if (!isAskUserQuestion && permissionMode === "free") {
      if (!isToolAllowed(toolName, allowedTools)) {
        return {
          behavior: "deny",
          message: `Tool ${toolName} is not allowed by allowedTools restriction`
        } as PermissionResult;
      }
      return { behavior: "allow", updatedInput: input } as PermissionResult;
    }

    // SECURE mode: check allowedTools and require user approval
    if (!isToolAllowed(toolName, allowedTools)) {
      return {
        behavior: "deny",
        message: `Tool ${toolName} is not allowed by allowedTools restriction`
      } as PermissionResult;
    }

    // Check if we're exceeding the maximum pending permissions limit
    if (session.pendingPermissions.size >= fullConfig.maxPendingPermissions) {
      // First, try to cleanup stale entries
      const now = Date.now();
      for (const [toolUseId, entry] of session.pendingPermissions) {
        if (entry.createdAt < now - fullConfig.staleThresholdMs) {
          cleanupEntry(toolUseId, entry);
        }
      }

      // If still at limit, deny new request
      if (session.pendingPermissions.size >= fullConfig.maxPendingPermissions) {
        console.warn(
          `[Runner] Too many pending permission requests (${session.pendingPermissions.size}), denying new request`
        );
        return {
          behavior: "deny",
          message: `Too many pending permission requests (max: ${fullConfig.maxPendingPermissions})`
        } as PermissionResult;
      }
    }

    // Request user permission
    const toolUseId = crypto.randomUUID();
    const createdAt = Date.now();

    sendPermissionRequest(toolUseId, toolName, input);

    return new Promise<PermissionResult>((resolve) => {
      // Create entry with tracking
      const entry: PendingPermissionEntry = {
        toolUseId,
        toolName,
        input,
        createdAt,
        resolve: (result: PermissionResult) => {
          cleanupEntry(toolUseId, entry);
          resolve(result);
        }
      };

      // Set timeout to prevent indefinite waiting
      const timeoutId = setTimeout(() => {
        console.warn(
          `[Runner] Permission request timed out for tool ${toolName} (${toolUseId})`
        );
        cleanupEntry(toolUseId, entry);
        resolve({ behavior: "deny", message: "Permission request timed out after 5 minutes" });
      }, fullConfig.permissionTimeoutMs);

      entry.timeoutId = timeoutId;
      session.pendingPermissions.set(toolUseId, entry);

      // Handle abort signal
      const abortHandler = () => {
        signal.removeEventListener("abort", abortHandler);
        cleanupEntry(toolUseId, entry);
        resolve({ behavior: "deny", message: "Session aborted" });
      };

      signal.addEventListener("abort", abortHandler);
    });
  };
}
```

#### 4.4.4 Modificacion al Session Type

```typescript
// En session-store.ts, actualizar el tipo PendingPermission

export type PendingPermission = {
  toolUseId: string;
  toolName: string;
  input: unknown;
  resolve: (result: { behavior: "allow" | "deny"; updatedInput?: unknown; message?: string }) => void;
  // Campos adicionales para tracking de memory leaks
  createdAt?: number;
  timeoutId?: ReturnType<typeof setTimeout>;
};
```

#### 4.4.5 Archivos Afectados

| Archivo | Tipo de Cambio | Lineas |
|---------|----------------|--------|
| `src/electron/libs/runner.ts` | Modificar createCanUseTool | 120-220 |
| `src/electron/libs/session-store.ts` | Actualizar PendingPermission type | 6-11 |

---

## 5. Fase 3: Medium Priority Issues

### SEC-003: Model Config Validation Too Permissive

#### 5.3.1 Localizacion del Problema

**Archivo**: `src/electron/libs/provider-config.ts`
**Lineas**: 278-297

```typescript
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
    if (typeof value === "string" && value.length > 100) return false; // <-- ARBITRARIO
  }
  return true;
}
```

#### 5.3.2 Problema

1. **Longitud arbitraria**: 100 caracteres es un limite arbitrario sin fundamento tecnico
2. **Sin validacion de formato**: Nombres como `../../../etc/passwd` o `<script>alert(1)</script>` pasan la validacion
3. **Sin sanitizacion**: Caracteres especiales pueden causar problemas downstream

#### 5.3.3 Solucion

```typescript
/**
 * Pattern for valid model names
 * Allows: alphanumeric, hyphens, underscores, dots, slashes (for org/model format)
 * Examples: "claude-sonnet-4-20250514", "gpt-4", "deepseek-chat", "anthropic/claude-3-opus"
 */
const MODEL_NAME_PATTERN = /^[a-zA-Z0-9._\-\/]+$/;

/**
 * Maximum reasonable length for model names
 * Based on common model naming conventions:
 * - Anthropic: ~30-40 chars (claude-sonnet-4-20250514)
 * - OpenAI: ~10-20 chars (gpt-4-turbo)
 * - Custom: up to 200 chars should be sufficient
 */
const MAX_MODEL_NAME_LENGTH = 200;

/**
 * Validate models configuration with proper format validation
 *
 * @param models - The models object to validate
 * @returns ValidationResult with success status and any warnings
 */
interface ValidationResult {
  valid: boolean;
  warnings?: string[];
}

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
        console.warn(
          `[ProviderConfig] Model name for "${key}" exceeds ${MAX_MODEL_NAME_LENGTH} characters`,
          { modelName: value.substring(0, 50) + "..." }
        );
        return { valid: false };
      }

      // Validate format
      if (!MODEL_NAME_PATTERN.test(value)) {
        console.warn(
          `[ProviderConfig] Invalid model name format for "${key}": ${value}`,
          { hint: "Model names should contain only alphanumeric characters, hyphens, underscores, dots, and slashes" }
        );
        return { valid: false };
      }

      // Check for suspicious patterns
      if (value.includes("..") || value.includes("./") || value.includes("../")) {
        console.warn(
          `[ProviderConfig] Suspicious model name with path traversal: ${key}=${value}`
        );
        // Still allow it but warn - might be legitimate org/model format
      }
    }
  }

  return result;
}
```

---

### SEC-004: Error Messages with Sensitive Info

#### 5.4.1 Localizacion del Problema

**Archivo**: `src/electron/libs/provider-config.ts`
**Lineas**: 109-111

```typescript
} catch (error) {
  console.error("[SECURITY] Token encryption failed:", error); // <-- EXPONE STACK TRACE
  throw new Error("Failed to encrypt token - refusing to store plaintext credentials");
}
```

#### 5.4.2 Solucion

```typescript
} catch (error) {
  // Log detailed error internally for debugging (without exposing to user logs)
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  // eslint-disable-next-line no-console
  console.error("[SECURITY] Token encryption failed:", {
    message: errorMessage,
    // Only include stack trace in debug mode
    ...(process.env.DEBUG ? { stack: errorStack } : {})
  });

  // Throw generic error to user - no internal details
  throw new Error("Failed to encrypt token - refusing to store plaintext credentials");
}
```

---

### SEC-005: File Permissions Window (TOCTOU)

#### 5.5.1 Localizacion del Problema

**Archivo**: `src/electron/libs/provider-config.ts`
**Lineas**: 249-256

```typescript
writeFileSync(PROVIDERS_FILE, JSON.stringify(encryptedProviders, null, 2));

// Set restrictive file permissions (owner read/write only)
try {
  chmodSync(PROVIDERS_FILE, 0o600);
} catch {
  // Ignore permission errors (may not be supported on all platforms)
}
```

#### 5.5.2 Problema

Entre `writeFileSync` y `chmodSync`, el archivo tiene permisos default (0644). Window TOCTOU (Time-of-Check-Time-of-Use).

#### 5.5.3 Solucion

```typescript
import { writeFileSync, chmodSync, existsSync, unlinkSync, renameSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { app, safeStorage } from "electron";
import type { LlmProviderConfig } from "../types.js";

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
    } catch (renameError) {
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

// Reemplazar en saveProvider y saveProviderFromPayload:
// Cambiar: writeFileSync(PROVIDERS_FILE, JSON.stringify(encryptedProviders, null, 2));
// Por: saveProvidersAtomic(encryptedProviders);
```

---

### SEC-006: SSRF Config Read-Once

#### 5.6.1 Localizacion del Problema

**Archivo**: `src/electron/libs/provider-config.ts`
**Lineas**: 20-21

```typescript
const ALLOW_LOCAL_PROVIDERS = process.env.CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS === "true";
```

#### 5.6.2 Problema

La variable puede ser modificada en runtime por un atacante con acceso al proceso.

#### 5.6.3 Solucion

```typescript
/**
 * Security configuration - read once at module load time
 * These values cannot be modified during runtime
 */

// Read at module load time - this is the only time the env var is read
const _ALLOW_LOCAL_PROVIDERS_READ = process.env.CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS;
const ALLOW_LOCAL_PROVIDERS = _ALLOW_LOCAL_PROVIDERS_READ === "true" || _ALLOW_LOCAL_PROVIDERS_READ === "1";

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
    // eslint-disable-next-line no-console
    console.warn(
      "[Security] Could not lock CLAUDE_COWORK_ALLOW_LOCAL_PROVIDERS environment variable",
      "Runtime modification may be possible - consider using a different configuration method"
    );
  }
}

// Export as const to prevent reassignment
export { ALLOW_LOCAL_PROVIDERS };
```

---

### QUAL-003: IPC Handlers Violate SRP

#### 5.7.1 Localizacion del Problema

**Archivo**: `src/electron/ipc-handlers.ts`
**Lineas**: 71-330

La funcion `handleClientEvent` tiene ~260 lineas y maneja todos los tipos de eventos.

#### 5.7.2 Solucion: Patron Strategy

```typescript
import { BrowserWindow, app } from "electron";
import type { ClientEvent, ServerEvent } from "./types.js";
import { runClaude, type RunnerHandle } from "./libs/runner.js";
import { SessionStore } from "./libs/session-store.js";
import { loadProvidersSafe, saveProviderFromPayload, deleteProvider, getProviderEnvById, toSafeProvider, getProvider } from "./libs/provider-config.js";
import { orchestratorAgent } from "./libs/orchestrator-agent.js";
import { join } from "path";

const DB_PATH = join(app.getPath("userData"), "sessions.db");
const sessions = new SessionStore(DB_PATH);
const runnerHandles = new Map<string, RunnerHandle>();

// ============================================================================
// INTERFAZ BASE PARA HANDLERS
// ============================================================================

interface EventHandler {
  /** Check if this handler can process the event */
  canHandle(event: ClientEvent): boolean;

  /** Process the event and emit response(s) */
  handle(event: ClientEvent): void;

  /** Optional: Get handler priority (lower = higher priority) */
  getPriority?(): number;
}

// ============================================================================
// HANDLER BASE CON FUNCIONALIDAD COMUN
// ============================================================================

abstract class BaseHandler implements EventHandler {
  protected sessions: SessionStore;
  protected runnerHandles: Map<string, RunnerHandle>;

  constructor(sessions: SessionStore, runnerHandles: Map<string, RunnerHandle>) {
    this.sessions = sessions;
    this.runnerHandles = runnerHandles;
  }

  abstract canHandle(event: ClientEvent): boolean;
  abstract handle(event: ClientEvent): void;

  getPriority(): number {
    return 100; // Default priority
  }

  /**
   * Helper to emit an event to all windows
   */
  protected emit(event: ServerEvent): void {
    const payload = JSON.stringify(event);
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send("server-event", payload);
    }
  }

  /**
   * Helper to emit and persist session status
   */
  protected emitStatus(sessionId: string, status: string, title?: string, cwd?: string, error?: string): void {
    this.sessions.updateSession(sessionId, { status: status as any });

    this.emit({
      type: "session.status",
      payload: { sessionId, status, title, cwd, error }
    });
  }
}

// ============================================================================
// HANDLERS INDIVIDUALES
// ============================================================================

class SessionListHandler extends BaseHandler {
  canHandle(event: ClientEvent): boolean {
    return event.type === "session.list";
  }

  handle(event: ClientEvent): void {
    this.emit({
      type: "session.list",
      payload: { sessions: this.sessions.listSessions() }
    });
  }
}

class SessionHistoryHandler extends BaseHandler {
  canHandle(event: ClientEvent): boolean {
    return event.type === "session.history";
  }

  handle(event: ClientEvent): void {
    const history = this.sessions.getSessionHistory(event.payload.sessionId);
    if (!history) {
      this.emit({
        type: "runner.error",
        payload: { message: "Unknown session" }
      });
      return;
    }

    this.emit({
      type: "session.history",
      payload: {
        sessionId: history.session.id,
        status: history.session.status,
        messages: history.messages
      }
    });
  }
}

class SessionStartHandler extends BaseHandler {
  canHandle(event: ClientEvent): boolean {
    return event.type === "session.start";
  }

  handle(event: ClientEvent): void {
    const session = this.sessions.createSession({
      cwd: event.payload.cwd,
      title: event.payload.title,
      allowedTools: event.payload.allowedTools,
      prompt: event.payload.prompt,
      permissionMode: event.payload.permissionMode
    });

    const providerEnv = event.payload.providerId ? getProviderEnvById(event.payload.providerId) : null;

    this.sessions.updateSession(session.id, {
      status: "running",
      lastPrompt: event.payload.prompt
    });

    this.emitStatus(session.id, "running", session.title, session.cwd);

    this.emit({
      type: "stream.user_prompt",
      payload: { sessionId: session.id, prompt: event.payload.prompt }
    });

    runClaude({
      prompt: event.payload.prompt,
      session,
      resumeSessionId: session.claudeSessionId,
      onEvent: (evt) => this.emit(evt as ServerEvent),
      onSessionUpdate: (updates) => {
        this.sessions.updateSession(session.id, updates);
      },
      providerEnv
    })
      .then((handle) => {
        this.runnerHandles.set(session.id, handle);
        this.sessions.setAbortController(session.id, undefined);
      })
      .catch((error) => {
        this.sessions.updateSession(session.id, { status: "error" });
        this.emitStatus(session.id, "error", session.title, session.cwd, String(error));
      });
  }
}

class SessionContinueHandler extends BaseHandler {
  canHandle(event: ClientEvent): boolean {
    return event.type === "session.continue";
  }

  handle(event: ClientEvent): void {
    const session = this.sessions.getSession(event.payload.sessionId);
    if (!session) {
      this.emit({
        type: "runner.error",
        payload: { message: "Unknown session" }
      });
      return;
    }

    if (!session.claudeSessionId) {
      this.emit({
        type: "runner.error",
        payload: { sessionId: session.id, message: "Session has no resume id yet." }
      });
      return;
    }

    const providerEnv = event.payload.providerId ? getProviderEnvById(event.payload.providerId) : null;

    this.sessions.updateSession(session.id, { status: "running", lastPrompt: event.payload.prompt });
    this.emitStatus(session.id, "running", session.title, session.cwd);

    this.emit({
      type: "stream.user_prompt",
      payload: { sessionId: session.id, prompt: event.payload.prompt }
    });

    runClaude({
      prompt: event.payload.prompt,
      session,
      resumeSessionId: session.claudeSessionId,
      onEvent: (evt) => this.emit(evt as ServerEvent),
      onSessionUpdate: (updates) => {
        this.sessions.updateSession(session.id, updates);
      },
      providerEnv
    })
      .then((handle) => {
        this.runnerHandles.set(session.id, handle);
      })
      .catch((error) => {
        this.sessions.updateSession(session.id, { status: "error" });
        this.emitStatus(session.id, "error", session.title, session.cwd, String(error));
      });
  }
}

class SessionStopHandler extends BaseHandler {
  canHandle(event: ClientEvent): boolean {
    return event.type === "session.stop";
  }

  handle(event: ClientEvent): void {
    const session = this.sessions.getSession(event.payload.sessionId);
    if (!session) return;

    const handle = this.runnerHandles.get(session.id);
    if (handle) {
      handle.abort();
      this.runnerHandles.delete(session.id);
    }

    this.sessions.updateSession(session.id, { status: "idle" });
    this.emitStatus(session.id, "idle", session.title, session.cwd);
  }
}

class SessionDeleteHandler extends BaseHandler {
  canHandle(event: ClientEvent): boolean {
    return event.type === "session.delete";
  }

  handle(event: ClientEvent): void {
    const sessionId = event.payload.sessionId;
    const handle = this.runnerHandles.get(sessionId);
    if (handle) {
      handle.abort();
      this.runnerHandles.delete(sessionId);
    }

    this.sessions.deleteSession(sessionId);
    this.emit({
      type: "session.deleted",
      payload: { sessionId }
    });
  }
}

class PermissionResponseHandler extends BaseHandler {
  canHandle(event: ClientEvent): boolean {
    return event.type === "permission.response";
  }

  handle(event: ClientEvent): void {
    const session = this.sessions.getSession(event.payload.sessionId);
    if (!session) return;

    const pending = session.pendingPermissions.get(event.payload.toolUseId);
    if (pending) {
      pending.resolve(event.payload.result);
    }
  }
}

class ProviderListHandler extends BaseHandler {
  canHandle(event: ClientEvent): boolean {
    return event.type === "provider.list";
  }

  handle(event: ClientEvent): void {
    const providers = loadProvidersSafe();
    this.emit({
      type: "provider.list",
      payload: { providers }
    });
  }
}

class ProviderSaveHandler extends BaseHandler {
  canHandle(event: ClientEvent): boolean {
    return event.type === "provider.save";
  }

  handle(event: ClientEvent): void {
    try {
      const savedProvider = saveProviderFromPayload(event.payload.provider);
      this.emit({
        type: "provider.saved",
        payload: { provider: savedProvider }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save provider";
      this.emit({
        type: "runner.error",
        payload: { message: `Provider save failed: ${message}` }
      });
    }
  }
}

class ProviderDeleteHandler extends BaseHandler {
  canHandle(event: ClientEvent): boolean {
    return event.type === "provider.delete";
  }

  handle(event: ClientEvent): void {
    const deleted = deleteProvider(event.payload.providerId);
    if (deleted) {
      this.emit({
        type: "provider.deleted",
        payload: { providerId: event.payload.providerId }
      });
    }
  }
}

class ProviderGetHandler extends BaseHandler {
  canHandle(event: ClientEvent): boolean {
    return event.type === "provider.get";
  }

  handle(event: ClientEvent): void {
    const provider = getProvider(event.payload.providerId);
    if (provider) {
      this.emit({
        type: "provider.data",
        payload: { provider: toSafeProvider(provider) }
      });
    }
  }
}

// ============================================================================
// REGISTRY DE HANDLERS
// ============================================================================

class HandlerRegistry {
  private handlers: EventHandler[] = [];
  private sessions: SessionStore;
  private runnerHandles: Map<string, RunnerHandle>;

  constructor(sessions: SessionStore, runnerHandles: Map<string, RunnerHandle>) {
    this.sessions = sessions;
    this.runnerHandles = runnerHandles;

    // Register all handlers
    this.register(new SessionListHandler(sessions, runnerHandles));
    this.register(new SessionHistoryHandler(sessions, runnerHandles));
    this.register(new SessionStartHandler(sessions, runnerHandles));
    this.register(new SessionContinueHandler(sessions, runnerHandles));
    this.register(new SessionStopHandler(sessions, runnerHandles));
    this.register(new SessionDeleteHandler(sessions, runnerHandles));
    this.register(new PermissionResponseHandler(sessions, runnerHandles));
    this.register(new ProviderListHandler(sessions, runnerHandles));
    this.register(new ProviderSaveHandler(sessions, runnerHandles));
    this.register(new ProviderDeleteHandler(sessions, runnerHandles));
    this.register(new ProviderGetHandler(sessions, runnerHandles));
  }

  private register(handler: EventHandler): void {
    this.handlers.push(handler);
    // Sort by priority (lower = higher priority)
    this.handlers.sort((a, b) => (a.getPriority?.() || 100) - (b.getPriority?.() || 100));
  }

  handle(event: ClientEvent): void {
    for (const handler of this.handlers) {
      if (handler.canHandle(event)) {
        handler.handle(event);
        return;
      }
    }

    // Unknown event type
    console.warn(`[IPC] Unknown event type: ${event.type}`);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

const registry = new HandlerRegistry(sessions, runnerHandles);

export function handleClientEvent(event: ClientEvent): void {
  registry.handle(event);
}

export function cleanupAllSessions(): void {
  for (const [, handle] of runnerHandles) {
    handle.abort();
  }
  runnerHandles.clear();
  sessions.close();
}

export function initializeHandlers(): void {
  orchestratorAgent.initialize();
}

export { sessions, orchestratorAgent };
```

---

### SIMP-001: Nested Ternary

#### 5.8.1 Localizacion del Problema

**Archivo**: `src/electron/libs/provider-config.ts`
**Linea**: 332

```typescript
authToken: payload.authToken || existingProvider?.authToken || "",
```

#### 5.8.2 Solucion

```typescript
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

// Uso en saveProviderFromPayload:
authToken: resolveAuthToken(payload.authToken, existingProvider?.authToken),
```

---

### SIMP-002: JSON Parsing Duplication

#### 5.9.1 Localizacion del Problema

**Archivo**: `src/electron/libs/session-store.ts`
**Linea**: 146

```typescript
const messages = (this.db
  .prepare(
    `select data from messages where session_id = ? order by created_at asc`
  )
  .all(id) as Array<Record<string, unknown>>)
  .map((row) => JSON.parse(String(row.data)) as StreamMessage);
```

#### 5.9.2 Solucion

```typescript
/**
 * Parse a message row from the database
 *
 * @param row - Database row containing message data
 * @returns Parsed StreamMessage
 * @throws Error if row is invalid or parsing fails
 *
 * @internal
 */
function parseMessageRow(row: Record<string, unknown>): StreamMessage {
  // Validate row structure
  if (!row) {
    throw new Error("Invalid message row: row is null or undefined");
  }

  if (!row.data) {
    throw new Error("Invalid message row: missing 'data' field");
  }

  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(String(row.data));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse message data: ${errorMessage}`);
  }

  // Validate parsed data is an object
  if (!data || typeof data !== "object") {
    throw new Error("Invalid message: parsed data is not an object");
  }

  return data as StreamMessage;
}

/**
 * Parse multiple message rows
 *
 * @param rows - Array of database rows
 * @returns Array of parsed StreamMessages
 *
 * @internal
 */
function parseMessageRows(rows: Array<Record<string, unknown>>): StreamMessage[] {
  const messages: StreamMessage[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      messages.push(parseMessageRow(rows[i]));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push({ index: i, error: errorMessage });

      // eslint-disable-next-line no-console
      console.warn(
        `[SessionStore] Failed to parse message at index ${i}`,
        { error: errorMessage }
      );
    }
  }

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[SessionStore] Failed to parse ${errors.length} messages out of ${rows.length}`,
      { errors }
    );
  }

  return messages;
}

// Uso en getSessionHistory:
const messages = parseMessageRows(
  this.db
    .prepare(
      `select data from messages where session_id = ? order by created_at asc`
    )
    .all(id) as Array<Record<string, unknown>>
);
```

---

### ARCH-001: Credential Coupling

#### 5.10.1 Problema

`runner.ts` obtiene el token a traves de `getProviderEnvById()` que desencripta el token y lo pasa como variable de entorno. Esto crea acoplamiento directo.

#### 5.10.2 Solucion: Interfaz de Credential Provider

```typescript
// provider-config.ts

/**
 * Interface for credential providers
 * Allows decoupling of credential handling from runner logic
 */
export interface CredentialProvider {
  /**
   * Get the authentication token for a provider
   * @param providerId - The provider ID
   * @returns The decrypted token or null if not found
   */
  getToken(providerId: string): string | null;

  /**
   * Get the base URL for a provider
   * @param providerId - The provider ID
   * @returns The base URL or null if not found
   */
  getBaseUrl(providerId: string): string | null;

  /**
   * Get the model configuration for a provider
   * @param providerId - The provider ID
   * @returns Model configuration or null if not found
   */
  getModelConfig(providerId: string): {
    defaultModel?: string;
    opus?: string;
    sonnet?: string;
    haiku?: string;
  } | null;

  /**
   * Check if a provider exists and has valid configuration
   * @param providerId - The provider ID
   * @returns true if provider exists and is valid
   */
  isValidProvider(providerId: string): boolean;
}

/**
 * Default credential provider implementation
 * Uses the existing provider configuration system
 */
export class DefaultCredentialProvider implements CredentialProvider {
  getToken(providerId: string): string | null {
    // Handle template providers
    if (providerId.startsWith("template_")) {
      const templateId = providerId.replace("template_", "");
      const defaultProvider = getDefaultProvider(templateId);
      return defaultProvider?.authToken || null;
    }

    // Handle user providers
    const provider = getProvider(providerId);
    return provider?.authToken || null;
  }

  getBaseUrl(providerId: string): string | null {
    if (providerId.startsWith("template_")) {
      const templateId = providerId.replace("template_", "");
      const defaultProvider = getDefaultProvider(templateId);
      return defaultProvider?.baseUrl || null;
    }

    const provider = getProvider(providerId);
    return provider?.baseUrl || null;
  }

  getModelConfig(providerId: string): {
    defaultModel?: string;
    opus?: string;
    sonnet?: string;
    haiku?: string;
  } | null {
    if (providerId.startsWith("template_")) {
      const templateId = providerId.replace("template_", "");
      const defaultProvider = getDefaultProvider(templateId);
      return defaultProvider?.models || null;
    }

    const provider = getProvider(providerId);
    if (!provider) return null;

    return {
      defaultModel: provider.defaultModel,
      opus: provider.models?.opus,
      sonnet: provider.models?.sonnet,
      haiku: provider.models?.haiku
    };
  }

  isValidProvider(providerId: string): boolean {
    if (providerId.startsWith("template_")) {
      const templateId = providerId.replace("template_", "");
      return getDefaultProvider(templateId) !== null;
    }

    return getProvider(providerId) !== null;
  }
}

// Singleton instance
export const defaultCredentialProvider = new DefaultCredentialProvider();
```

```typescript
// runner.ts - Updated to accept credential provider

export type RunnerOptions = {
  prompt: string;
  session: Session;
  resumeSessionId?: string;
  onEvent: (event: ServerEvent) => void;
  onSessionUpdate?: (updates: Partial<Session>) => void;
  // Use credential provider instead of providerEnv
  credentialProvider?: CredentialProvider;
};

export async function runClaude(options: RunnerOptions): Promise<RunnerHandle> {
  const {
    prompt,
    session,
    resumeSessionId,
    onEvent,
    onSessionUpdate,
    credentialProvider = defaultCredentialProvider
  } = options;

  // ... rest of implementation

  // Build environment from credential provider
  const customEnv: Record<string, string> = {};

  if (session.providerId) {
    const baseUrl = credentialProvider.getBaseUrl(session.providerId);
    if (baseUrl) {
      customEnv.ANTHROPIC_BASE_URL = baseUrl;
    }

    const modelConfig = credentialProvider.getModelConfig(session.providerId);
    if (modelConfig) {
      if (modelConfig.defaultModel) {
        customEnv.ANTHROPIC_MODEL = modelConfig.defaultModel;
      }
      if (modelConfig.opus) {
        customEnv.ANTHROPIC_DEFAULT_OPUS_MODEL = modelConfig.opus;
      }
      if (modelConfig.sonnet) {
        customEnv.ANTHROPIC_DEFAULT_SONNET_MODEL = modelConfig.sonnet;
      }
      if (modelConfig.haiku) {
        customEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL = modelConfig.haiku;
      }
    }
  }

  // Token is NOT included in environment variables
  // It would be provided via IPC in a future enhancement
  const token = session.providerId ? credentialProvider.getToken(session.providerId) : null;
  if (token) {
    // Store token securely for use with SDK
    // This is a placeholder for IPC-based token handling
    (session as any)._authToken = token;
  }

  // ... rest of implementation
}
```

---

## 6. Fase 4: Low Priority & Cleanup

### SEC-007: Hardcoded Path

```typescript
// main.ts

import { join } from "path";
import { existsSync } from "fs";

/**
 * Resolve the Claude SDK executable path dynamically
 * Tries multiple possible locations based on the runtime environment
 *
 * @returns The resolved path to the Claude SDK executable
 * @throws Error if no valid path is found
 */
function resolveClaudeSdkPath(): string {
  const possiblePaths = [
    // Production: In packaged app
    join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "@anthropic-ai",
      "claude-agent-sdk",
      "cli.js"
    ),

    // Development: In source tree
    join(process.cwd(), "node_modules", "@anthropic-ai", "claude-agent-sdk", "cli.js"),

    // Alternative: Global installation
    join(__dirname, "..", "node_modules", "@anthropic-ai", "claude-agent-sdk", "cli.js"),

    // Bun global install
    join(process.env.HOME || "", ".bun", "packages", "global-node_modules",
        "@anthropic-ai", "claude-agent-sdk", "cli.js"),
  ];

  for (const sdkPath of possiblePaths) {
    if (sdkPath && existsSync(sdkPath)) {
      return sdkPath;
    }
  }

  throw new Error(
    `Could not find Claude SDK executable. Searched in:\n${
      possiblePaths.map(p => `  - ${p}`).join("\n")
    }`
  );
}

const CLAUDE_SDK_PATH = resolveClaudeSdkPath();
```

---

### ARCH-002: Runtime Schema Validation (Opcional)

```typescript
// types.ts

import { z } from "zod";

// Client Event Schemas
export const SessionListPayloadSchema = z.object({});

export const SessionStartPayloadSchema = z.object({
  cwd: z.string().optional(),
  title: z.string().min(1, "Title is required"),
  allowedTools: z.string().optional(),
  prompt: z.string().min(1, "Prompt is required"),
  permissionMode: z.enum(["secure", "free"]).optional(),
  providerId: z.string().optional()
});

export const SessionContinuePayloadSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  prompt: z.string().min(1, "Prompt is required"),
  providerId: z.string().optional()
});

export const SessionStopPayloadSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID")
});

export const SessionDeletePayloadSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID")
});

export const SessionHistoryPayloadSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID")
});

export const PermissionResponsePayloadSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID"),
  toolUseId: z.string().uuid("Invalid tool use ID"),
  result: z.object({
    behavior: z.enum(["allow", "deny"]),
    updatedInput: z.unknown().optional(),
    message: z.string().optional()
  })
});

// Provider Event Schemas
export const ProviderSavePayloadSchema = z.object({
  provider: z.object({
    id: z.string().optional(),
    name: z.string().min(1, "Provider name is required"),
    baseUrl: z.string().url("Invalid URL format").optional(),
    authToken: z.string().optional(),
    defaultModel: z.string().optional(),
    models: z.object({
      opus: z.string().optional(),
      sonnet: z.string().optional(),
      haiku: z.string().optional()
    }).optional()
  })
});

export const ProviderDeletePayloadSchema = z.object({
  providerId: z.string()
});

export const ProviderGetPayloadSchema = z.object({
  providerId: z.string()
});

// Main Client Event Schema
export const ClientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session.list"), payload: SessionListPayloadSchema }),
  z.object({ type: z.literal("session.start"), payload: SessionStartPayloadSchema }),
  z.object({ type: z.literal("session.continue"), payload: SessionContinuePayloadSchema }),
  z.object({ type: z.literal("session.stop"), payload: SessionStopPayloadSchema }),
  z.object({ type: z.literal("session.delete"), payload: SessionDeletePayloadSchema }),
  z.object({ type: z.literal("session.history"), payload: SessionHistoryPayloadSchema }),
  z.object({ type: z.literal("permission.response"), payload: PermissionResponsePayloadSchema }),
  z.object({ type: z.literal("provider.list"), payload: z.object({}) }),
  z.object({ type: z.literal("provider.save"), payload: ProviderSavePayloadSchema }),
  z.object({ type: z.literal("provider.delete"), payload: ProviderDeletePayloadSchema }),
  z.object({ type: z.literal("provider.get"), payload: ProviderGetPayloadSchema })
]);

export type ClientEvent = z.infer<typeof ClientEventSchema>;

/**
 * Validate a client event against the schema
 * @param event - The event to validate
 * @returns The validated event
 * @throws ZodError if validation fails
 */
export function validateClientEvent(event: unknown): ClientEvent {
  const result = ClientEventSchema.safeParse(event);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ");
    throw new Error(`Invalid client event: ${errors}`);
  }
  return result.data;
}
```

---

## 7. Strategy de Testing

### 7.1 Unit Tests

| Finding | Test File | Coverage Target |
|---------|-----------|-----------------|
| SEC-001 | provider-config.test.ts | 100% sanitization function |
| SEC-003 | provider-config.test.ts | 100% validation function |
| SIMP-001 | provider-config.test.ts | 100% resolveAuthToken |
| SIMP-002 | session-store.test.ts | 100% parseMessageRow |
| QUAL-001 | session-store.test.ts | 100% loadSessions error handling |

### 7.2 Integration Tests

| Test | Scope | Description |
|------|-------|-------------|
| Provider Flow | provider-config + ipc-handlers | Full save/load cycle |
| Session Flow | session-store + runner | Create, resume, stop session |
| Token Security | provider-config | Verify token encryption/decryption |
| Memory Leak Test | runner | Long-running session with many permissions |

### 7.3 Manual Testing Checklist

- [ ] Provider configuration saves and loads correctly
- [ ] Sessions can be created, resumed, and deleted
- [ ] Theme toggle works in both directions
- [ ] Prompt input performs well with rapid typing
- [ ] Memory usage is stable during long sessions
- [ ] Logs do not contain sensitive data
- [ ] Invalid paths are handled gracefully

---

## 8. Criterios de Exito

1. [ ] **Todos los 18 hallazgos corregidos**
2. [ ] **TypeScript compilation**: `bun run build` pasa sin errores
3. [ ] **ESLint**: `bun run lint` pasa sin warnings nuevos
4. [ ] **Tests existentes**: 100% passing
5. [ ] **Nuevos tests**: Coverage para todos los fixes de seguridad
6. [ ] **Build multiplataforma**: Linux, macOS, Windows
7. [ ] **Manual testing**: Sin regresiones en funcionalidad

---

## 9. Procedimientos de Rollback

### 9.1 Rollback por Finding

Cada finding tiene su propio procedimiento de rollback documentado en su seccion.

### 9.2 Rollback Completo

```bash
# Revertir todos los cambios
git checkout HEAD~1

# Verificar estado
git status

# Si hay conflictos de merge
git reset --hard HEAD~1
git clean -fd
```

### 9.3 Rollback Selectivo

```bash
# Revertir solo un archivo
git checkout HEAD -- src/electron/libs/provider-config.ts

# Revertir un rango de commits
git revert --no-commit <start-commit>..<end-commit>
git commit -m "Revert changes from review fixes"
```

---

## 10. Estimacion de Esfuerzo

| Fase | Hallazgos | Tiempo Estimado | Dependencies |
|------|-----------|-----------------|--------------|
| Phase 1 | 1 (SEC-001) | 15 min | None |
| Phase 2 | 3 (SEC-002, QUAL-001, QUAL-002) | 2 horas | Phase 1 |
| Phase 3 | 8 | 4 horas | Phase 1, 2 |
| Phase 4 | 6 | 2 horas | None |
| **Total** | **18** | **~8.5 horas** | - |

---

## 11. Quality Gates - Verificaciones Obligatorias

### 11.1 Regla General: NO PROSEGUIR sin pasar gates

**CUALQUIERA sea la circunstancia, NO se puede avanzar a la siguiente fase o tarea sin:**

1. ✅ TypeScript compilation: `bun run build` (0 errores)
2. ✅ ESLint: `bun run lint` (0 warnings nuevos)
3. ✅ Tests unitarios del finding: 100% passing
4. ✅ Tests existentes: 100% passing (sin regresiones)
5. ✅ Verificacion manual del fix (si aplica)
6. ✅ Documentacion actualizada (si aplica)

### 11.2 Quality Gates por Fase

#### PHASE 1 GATES (SEC-001: Log Injection)

| Gate | Check | Herramienta | Criterio Aceptacion |
|------|-------|-------------|---------------------|
| G1.1 | TypeScript compile | `bun run build` | 0 errores |
| G1.2 | ESLint check | `bun run lint` | 0 warnings nuevos |
| G1.3 | Unit tests | `bun test --grep "sanitizeForLog"` | 100% passing |
| G1.4 | Log sanitization test | Manual | Verificar que `\n`, `\r`, `\t` se convierten a `_` |
| G1.5 | Integration test | Manual | Verificar que logs no muestran caracteres de control |

**COMANDO PARA VERIFICAR GATES FASE 1:**
```bash
# 1. Compilar
bun run build 2>&1 | tee phase1_build.log

# 2. Lint
bun run lint 2>&1 | tee phase1_lint.log

# 3. Tests unitarios
bun test --grep "sanitizeForLog" 2>&1 | tee phase1_tests.log

# 4. Verificar logs
# Ejecutar la app y verificar provider-config.ts:370 output
```

**SOLO PASAR A PHASE 2 cuando TODOS los gates G1.1-G1.5 pasen.**

#### PHASE 2 GATES

**SEC-002: Token Environment Variable**

| Gate | Check | Herramienta | Criterio Aceptacion |
|------|-------|-------------|---------------------|
| G2.1 | TypeScript compile | `bun run build` | 0 errores |
| G2.2 | ESLint check | `bun run lint` | 0 warnings nuevos |
| G2.3 | Unit tests | `bun test --grep "TokenHandlingMode"` | 100% passing |
| G2.4 | IPC handler test | `bun test --grep "get-provider-token"` | 100% passing |
| G2.5 | Token security test | Manual | Token NO visible en `/proc/<pid>/environ` |
| G2.6 | Backwards compatibility | Manual | Proveedores existentes funcionan igual |

**QUAL-001: Race Condition**

| Gate | Check | Herramienta | Criterio Aceptacion |
|------|-------|-------------|---------------------|
| G2.7 | TypeScript compile | `bun run build` | 0 errores |
| G2.8 | ESLint check | `bun run lint` | 0 warnings nuevos |
| G2.9 | Unit tests | `bun test --grep "loadSessions"` | 100% passing |
| G2.10 | Error logging test | Manual | Verificar warning en console cuando cwd invalido |
| G2.11 | Session preservation test | Manual | Session carga aunque cwd eliminado |

**QUAL-002: Memory Leak**

| Gate | Check | Herramienta | Criterio Aceptacion |
|------|-------|-------------|---------------------|
| G2.12 | TypeScript compile | `bun run build` | 0 errores |
| G2.13 | ESLint check | `bun run lint` | 0 warnings nuevos |
| G2.14 | Unit tests | `bun test --grep "createCanUseTool"` | 100% passing |
| G2.15 | Memory test | Manual con DevTools | Map no crece indefinidamente |
| G2.16 | Cleanup test | Manual | Stale entries se limpian periodicamente |

**COMANDO PARA VERIFICAR TODOS LOS GATES FASE 2:**
```bash
#!/bin/bash
# phase2_gates.sh

echo "=== FASE 2 GATES VERIFICATION ==="

echo "1. TypeScript Build..."
if bun run build 2>&1 | grep -q "error"; then
    echo "❌ GATE FAILED: TypeScript compilation failed"
    exit 1
fi
echo "✅ GATE PASSED: TypeScript build"

echo "2. ESLint..."
if bun run lint 2>&1 | grep -q "warning"; then
    echo "❌ GATE FAILED: ESLint has warnings"
    exit 1
fi
echo "✅ GATE PASSED: ESLint clean"

echo "3. Token Handling Tests..."
if ! bun test --grep "TokenHandlingMode" 2>&1 | tail -5 | grep -q "passed"; then
    echo "❌ GATE FAILED: Token handling tests failed"
    exit 1
fi
echo "✅ GATE PASSED: Token tests"

echo "4. Session Load Tests..."
if ! bun test --grep "loadSessions" 2>&1 | tail -5 | grep -q "passed"; then
    echo "❌ GATE FAILED: Session load tests failed"
    exit 1
fi
echo "✅ GATE PASSED: Session tests"

echo "5. Permission Tests..."
if ! bun test --grep "createCanUseTool" 2>&1 | tail -5 | grep -q "passed"; then
    echo "❌ GATE FAILED: Permission tests failed"
    exit 1
fi
echo "✅ GATE PASSED: Permission tests"

echo "=== TODOS LOS GATES FASE 2 PASARON ==="
```

**SOLO PASAR A PHASE 3 cuando TODOS los gates G2.1-G2.16 pasen.**

#### PHASE 3 GATES (8 findings)

| Finding | Gates | Tests Required |
|---------|-------|----------------|
| SEC-003 | G3.1-G3.4 | Model validation tests |
| SEC-004 | G3.5-G3.7 | Error message sanitization tests |
| SEC-005 | G3.8-G3.10 | Atomic file write tests |
| SEC-006 | G3.11-G3.13 | SSRF config read-once tests |
| QUAL-003 | G3.14-G3.16 | IPC handler refactor tests |
| SIMP-001 | G3.17-G3.18 | resolveAuthToken tests |
| SIMP-002 | G3.19-G3.20 | parseMessageRow tests |
| ARCH-001 | G3.21-G3.24 | Credential provider interface tests |

**COMANDO PARA VERIFICAR TODOS LOS GATES FASE 3:**
```bash
#!/bin/bash
# phase3_gates.sh

echo "=== FASE 3 GATES VERIFICATION ==="

# Run all Phase 3 related tests
bun test --grep "validateModelConfig|Error.*message|AtomicFile|SSRF|IPC.*Handler|resolveAuthToken|parseMessageRow|CredentialProvider" 2>&1 | tee phase3_tests.log

# Verificar coverage
if grep -q "Coverage: 100%" phase3_tests.log || grep -q "All tests passed" phase3_tests.log; then
    echo "✅ GATE PASSED: All Phase 3 tests"
else
    echo "❌ GATE FAILED: Some tests failed"
    exit 1
fi
```

**SOLO PASAR A PHASE 4 cuando TODOS los gates G3.1-G3.24 pasen.**

#### PHASE 4 GATES (6 findings)

| Finding | Gates | Tests Required |
|---------|-------|----------------|
| SEC-007 | G4.1-G4.3 | Path resolution tests |
| QUAL-004 | G4.4-G4.5 | Type annotation tests |
| ARCH-002 | G4.6-G4.8 | Zod schema validation tests |
| ARCH-005 | G4.9-G4.10 | UnifiedCommandParser tests |
| ARCH-006 | G4.11-G4.12 | Path configuration tests |
| SIMP-004 | G4.13-G4.14 | Deprecation marker tests |

### 11.3 Quality Gates por Tarea Individual

#### SEC-001: Log Injection Fix

```
TAREA: SEC-001 - sanitizeForLog function

PASOS:
1. [ ] Crear archivo: src/electron/libs/provider-config.ts (agregar sanitizeForLog)
2. [ ] Modificar linea 370 en provider-config.ts
3. [ ] Crear archivo: src/electron/libs/__tests__/provider-config-sanitize.test.ts
4. [ ] Ejecutar G1.1-G1.5
5. [ ] SI ALGUN GATE FALLA: Corregir y re-ejecutar gates
6. [ ] SOLO CUANDO TODOS PASAN: Commit con mensaje "fix(SEC-001): prevent log injection"
7. [ ] Avanzar a siguiente tarea
```

#### SEC-002: Token Environment Variable Fix

```
TAREA: SEC-002 - Token handling modes

PASOS:
1. [ ] Modificar provider-config.ts (añadir getTokenHandlingMode, modificar getProviderEnv)
2. [ ] Modificar ipc-handlers.ts (añadir get-provider-token handler)
3. [ ] Crear archivo: src/electron/libs/__tests__/provider-config-token.test.ts
4. [ ] Ejecutar G2.1-G2.6
5. [ ] SI ALGUN GATE FALLA: Corregir y re-ejecutar gates
6. [ ] SOLO CUANDO TODOS PASAN: Commit con mensaje "fix(SEC-002): add secure token handling modes"
7. [ ] Avanzar a siguiente tarea
```

### 11.4 Checklist de Calidad Pre-Commit

**ANTES de cada commit, verificar:**

```bash
# 1. Compilacion
echo "=== PRE-COMMIT QUALITY CHECK ==="
bun run build
if [ $? -ne 0 ]; then
    echo "❌ FAIL: TypeScript compilation"
    exit 1
fi
echo "✅ PASS: TypeScript compilation"

# 2. Linting
bun run lint
if [ $? -ne 0 ]; then
    echo "❌ FAIL: ESLint"
    exit 1
fi
echo "✅ PASS: ESLint"

# 3. Tests relacionados
bun test --grep "SEC-001"  # Cambiar por el finding actual
if [ $? -ne 0 ]; then
    echo "❌ FAIL: Tests"
    exit 1
fi
echo "✅ PASS: Tests"

# 4. Verificar archivos modificados
git diff --stat
echo "Archivos modificados看起来正确"

echo "=== PRE-COMMIT CHECK COMPLETE ==="
```

### 11.5 Criterios de Bloqueo (Blockers)

**CONDICIONES QUE BLOQUEAN EL AVANCE:**

| Condicion | Accion | Solucion |
|-----------|--------|----------|
| TypeScript error | BLOCK | Corregir errores antes de continuar |
| ESLint warning nuevo | BLOCK | Corregir warning antes de continuar |
| Test unitario falla | BLOCK | Corregir test antes de continuar |
| Regresion en tests existentes | BLOCK | Identificar causa, corregir, re-testar |
| Build falla | BLOCK | Corregir build antes de continuar |
| Error en verificacion manual | BLOCK | Corregir bug antes de continuar |

### 11.6 Procedimiento de Escalamiento

**SI UN GATE FALLA:**

1. **Documentar el failure** en el archivo de log
2. **Analizar causa raiz** del failure
3. **Corregir el codigo** que causo el failure
4. **Re-ejecutar gates** que fallaron
5. **Verificar que no se introdujeron nuevos failures**
6. **SI persiste el failure** por mas de 2 intentos:
   - Documentar en `ISSUES.md`
   - Consultar con team lead
   - Considerar rollback del cambio

### 11.7 Quality Gates Summary Table

| Fase | Total Gates | Gate Prefix | Pass Required |
|------|-------------|-------------|---------------|
| Phase 1 | 5 | G1.x | 5/5 (100%) |
| Phase 2 | 16 | G2.x | 16/16 (100%) |
| Phase 3 | 24 | G3.x | 24/24 (100%) |
| Phase 4 | 14 | G4.x | 14/14 (100%) |
| **TOTAL** | **59** | - | **59/59 (100%)** |

---

## 12. Tracking de Progreso

### 12.1 Checklist de Implementacion

| Fase | Finding | Status | Gates | Commit |
|------|---------|--------|-------|--------|
| P1 | SEC-001 | [ ] Pending | G1.1-G1.5 | - |
| P2 | SEC-002 | [ ] Pending | G2.1-G2.6 | - |
| P2 | QUAL-001 | [ ] Pending | G2.7-G2.11 | - |
| P2 | QUAL-002 | [ ] Pending | G2.12-G2.16 | - |
| P3 | SEC-003 | [ ] Pending | G3.1-G3.4 | - |
| P3 | SEC-004 | [ ] Pending | G3.5-G3.7 | - |
| P3 | SEC-005 | [ ] Pending | G3.8-G3.10 | - |
| P3 | SEC-006 | [ ] Pending | G3.11-G3.13 | - |
| P3 | QUAL-003 | [ ] Pending | G3.14-G3.16 | - |
| P3 | SIMP-001 | [ ] Pending | G3.17-G3.18 | - |
| P3 | SIMP-002 | [ ] Pending | G3.19-G3.20 | - |
| P3 | ARCH-001 | [ ] Pending | G3.21-G3.24 | - |
| P4 | SEC-007 | [ ] Pending | G4.1-G4.3 | - |
| P4 | QUAL-004 | [ ] Pending | G4.4-G4.5 | - |
| P4 | ARCH-002 | [ ] Pending | G4.6-G4.8 | - |
| P4 | ARCH-005 | [ ] Pending | G4.9-G4.10 | - |
| P4 | ARCH-006 | [ ] Pending | G4.11-G4.12 | - |
| P4 | SIMP-004 | [ ] Pending | G4.13-G4.14 | - |

### 12.2 Comandos de Verificacion Rapida

```bash
# Verificar estado de todos los gates
alias gates="bun run build && bun run lint && bun test"

# Verificar un finding especifico
alias gates-sec001="bun test --grep 'sanitizeForLog'"

# Verificar Phase 2 completo
alias gates-phase2="bun test --grep 'TokenHandlingMode|loadSessions|createCanUseTool'"

# Generar reporte de progreso
./scripts/generate-progress-report.sh
```

---

*Plan generado automaticamente por el sistema de planificacion*
*Este documento serve como referencia para la implementacion de todos los fixes*
*Quality Gates Section v1.0 - 2026-01-18*
