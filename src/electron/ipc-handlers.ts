import { BrowserWindow } from "electron";
import type { ClientEvent, ServerEvent } from "./types.js";
import { runClaude, type RunnerHandle } from "./libs/runner.js";
import { SessionStore } from "./libs/session-store.js";
import { loadProvidersSafe, saveProviderFromPayload, deleteProvider, getProviderEnvById, toSafeProvider, getProvider } from "./libs/provider-config.js";
import { orchestratorAgent } from "./libs/orchestrator-agent.js";
import { app } from "electron";
import { join } from "path";

const DB_PATH = join(app.getPath("userData"), "sessions.db");
const sessions = new SessionStore(DB_PATH);
const runnerHandles = new Map<string, RunnerHandle>();

/**
 * Simple rate limiter to prevent DoS from renderer process
 * @internal
 */
const rateLimitState = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 100; // max requests per window
const RATE_WINDOW_MS = 60000; // 1 minute window

/**
 * Check if request should be rate limited
 * @param eventType - The type of IPC event
 * @returns true if allowed, false if rate limited
 */
function checkRateLimit(eventType: string): boolean {
  const now = Date.now();
  const entry = rateLimitState.get(eventType);

  // Reset or create entry if window expired
  if (!entry || now > entry.resetTime) {
    rateLimitState.set(eventType, { count: 1, resetTime: now + RATE_WINDOW_MS });
    return true;
  }

  // Check limit
  if (entry.count >= RATE_LIMIT) {
    console.warn(`[IPC] Rate limit exceeded for ${eventType} (${entry.count} requests in window)`);
    return false;
  }

  entry.count++;
  return true;
}

function broadcast(event: ServerEvent) {
  const payload = JSON.stringify(event);
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send("server-event", payload);
  }
}

function emit(event: ServerEvent) {
  if (event.type === "session.status") {
    sessions.updateSession(event.payload.sessionId, { status: event.payload.status });
  }
  if (event.type === "stream.message") {
    sessions.recordMessage(event.payload.sessionId, event.payload.message);
  }
  if (event.type === "stream.user_prompt") {
    sessions.recordMessage(event.payload.sessionId, {
      type: "user_prompt",
      prompt: event.payload.prompt
    });
  }
  broadcast(event);
}

export function handleClientEvent(event: ClientEvent) {
  // Rate limit check to prevent DoS
  if (!checkRateLimit(event.type)) {
    return; // Silently drop rate-limited requests
  }

  if (event.type === "session.list") {
    emit({
      type: "session.list",
      payload: { sessions: sessions.listSessions() }
    });
    return;
  }

  if (event.type === "session.history") {
    const history = sessions.getSessionHistory(event.payload.sessionId);
    if (!history) {
      emit({
        type: "runner.error",
        payload: { message: "Unknown session" }
      });
      return;
    }
    emit({
      type: "session.history",
      payload: {
        sessionId: history.session.id,
        status: history.session.status,
        messages: history.messages
      }
    });
    return;
  }

  if (event.type === "session.start") {
    const session = sessions.createSession({
      cwd: event.payload.cwd,
      title: event.payload.title,
      allowedTools: event.payload.allowedTools,
      prompt: event.payload.prompt,
      permissionMode: event.payload.permissionMode
    });

    // Get provider env vars if providerId is provided (decryption happens here in main process)
    console.log(`[IPC] session.start - providerId: ${event.payload.providerId || "none (using default)"}`);
    const providerEnv = event.payload.providerId ? getProviderEnvById(event.payload.providerId) : null;
    console.log(`[IPC] session.start - providerEnv:`, providerEnv ? {
      ANTHROPIC_MODEL: providerEnv.ANTHROPIC_MODEL,
      ANTHROPIC_BASE_URL: providerEnv.ANTHROPIC_BASE_URL,
      hasToken: !!providerEnv.ANTHROPIC_AUTH_TOKEN
    } : "null");

    sessions.updateSession(session.id, {
      status: "running",
      lastPrompt: event.payload.prompt
    });
    emit({
      type: "session.status",
      payload: { sessionId: session.id, status: "running", title: session.title, cwd: session.cwd }
    });

    emit({
      type: "stream.user_prompt",
      payload: { sessionId: session.id, prompt: event.payload.prompt }
    });

    runClaude({
      prompt: event.payload.prompt,
      session,
      resumeSessionId: session.claudeSessionId,
      onEvent: emit,
      onSessionUpdate: (updates) => {
        sessions.updateSession(session.id, updates);
      },
      providerEnv
    })
      .then((handle) => {
        runnerHandles.set(session.id, handle);
        sessions.setAbortController(session.id, undefined);
      })
      .catch((error) => {
        sessions.updateSession(session.id, { status: "error" });
        emit({
          type: "session.status",
          payload: {
            sessionId: session.id,
            status: "error",
            title: session.title,
            cwd: session.cwd,
            error: String(error)
          }
        });
      });

    return;
  }

  if (event.type === "session.continue") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) {
      emit({
        type: "runner.error",
        payload: { message: "Unknown session" }
      });
      return;
    }

    if (!session.claudeSessionId) {
      emit({
        type: "runner.error",
        payload: { sessionId: session.id, message: "Session has no resume id yet." }
      });
      return;
    }

    // Get provider env vars if providerId is provided (decryption happens here in main process)
    const providerEnv = event.payload.providerId ? getProviderEnvById(event.payload.providerId) : null;

    sessions.updateSession(session.id, { status: "running", lastPrompt: event.payload.prompt });
    emit({
      type: "session.status",
      payload: { sessionId: session.id, status: "running", title: session.title, cwd: session.cwd }
    });

    emit({
      type: "stream.user_prompt",
      payload: { sessionId: session.id, prompt: event.payload.prompt }
    });

    runClaude({
      prompt: event.payload.prompt,
      session,
      resumeSessionId: session.claudeSessionId,
      onEvent: emit,
      onSessionUpdate: (updates) => {
        sessions.updateSession(session.id, updates);
      },
      providerEnv
    })
      .then((handle) => {
        runnerHandles.set(session.id, handle);
      })
      .catch((error) => {
        sessions.updateSession(session.id, { status: "error" });
        emit({
          type: "session.status",
          payload: {
            sessionId: session.id,
            status: "error",
            title: session.title,
            cwd: session.cwd,
            error: String(error)
          }
        });
      });

    return;
  }

  if (event.type === "session.stop") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) return;

    const handle = runnerHandles.get(session.id);
    if (handle) {
      handle.abort();
      runnerHandles.delete(session.id);
    }

    sessions.updateSession(session.id, { status: "idle" });
    emit({
      type: "session.status",
      payload: { sessionId: session.id, status: "idle", title: session.title, cwd: session.cwd }
    });
    return;
  }

  if (event.type === "session.delete") {
    const sessionId = event.payload.sessionId;
    const handle = runnerHandles.get(sessionId);
    if (handle) {
      handle.abort();
      runnerHandles.delete(sessionId);
    }

    // Always try to delete and emit deleted event
    // Don't emit error if session doesn't exist - it may have already been deleted
    sessions.deleteSession(sessionId);
    emit({
      type: "session.deleted",
      payload: { sessionId }
    });
    return;
  }

  if (event.type === "permission.response") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) return;

    const pending = session.pendingPermissions.get(event.payload.toolUseId);
    if (pending) {
      pending.resolve(event.payload.result);
    }
    return;
  }

  // Provider configuration handlers
  // SECURITY: Always use SafeProviderConfig for IPC responses (no tokens)
  if (event.type === "provider.list") {
    // loadProvidersSafe() returns SafeProviderConfig[] - NO tokens
    const providers = loadProvidersSafe();
    emit({
      type: "provider.list",
      payload: { providers }
    });
    return;
  }

  if (event.type === "provider.save") {
    try {
      // saveProviderFromPayload handles token preservation, URL validation, and returns SafeProviderConfig
      const savedProvider = saveProviderFromPayload(event.payload.provider);
      emit({
        type: "provider.saved",
        payload: { provider: savedProvider }
      });
    } catch (error) {
      // Handle validation errors (SSRF prevention, encryption failures)
      const message = error instanceof Error ? error.message : "Failed to save provider";
      emit({
        type: "runner.error",
        payload: { message: `Provider save failed: ${message}` }
      });
    }
    return;
  }

  if (event.type === "provider.delete") {
    const deleted = deleteProvider(event.payload.providerId);
    if (deleted) {
      emit({
        type: "provider.deleted",
        payload: { providerId: event.payload.providerId }
      });
    }
    return;
  }

  if (event.type === "provider.get") {
    // Return SafeProviderConfig (no token)
    const provider = getProvider(event.payload.providerId);
    if (provider) {
      emit({
        type: "provider.data",
        payload: { provider: toSafeProvider(provider) }
      });
    }
    return;
  }
}

/**
 * Cleanup all running sessions
 * Should be called during app shutdown
 */
export function cleanupAllSessions(): void {
  for (const [, handle] of runnerHandles) {
    handle.abort();
  }
  runnerHandles.clear();
  sessions.close();
}

/**
 * Initialize IPC handlers and orchestrator
 * Should be called once during app startup
 */
export function initializeHandlers(): void {
  orchestratorAgent.initialize();
}

export { sessions, orchestratorAgent };
