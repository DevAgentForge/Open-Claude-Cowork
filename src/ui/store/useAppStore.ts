import { create } from 'zustand';
import type { ServerEvent, SessionStatus, StreamMessage, SafeProviderConfig, EnrichedMessage } from "../types";

/**
 * H-004: Generate unique client-side ID for React reconciliation
 * Uses crypto.randomUUID when available, falls back to timestamp + random
 */
let messageCounter = 0;
function generateClientId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `msg-${Date.now()}-${++messageCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * H-004: Enrich a message with a stable client-side ID
 */
function enrichMessage(msg: StreamMessage): EnrichedMessage {
  return { ...msg, _clientId: generateClientId() };
}

/**
 * M-006: Maximum number of messages to retain per session
 * Prevents unbounded memory growth in long-running sessions
 * Older messages are removed when this limit is exceeded
 */
const MAX_MESSAGES_PER_SESSION = 1000;

/**
 * Helper function to limit message array size (M-006)
 * Keeps the most recent messages up to MAX_MESSAGES_PER_SESSION
 */
function limitMessages(messages: EnrichedMessage[]): EnrichedMessage[] {
  if (messages.length <= MAX_MESSAGES_PER_SESSION) {
    return messages;
  }
  // Keep the most recent messages
  return messages.slice(-MAX_MESSAGES_PER_SESSION);
}

export type PermissionRequest = {
  toolUseId: string;
  toolName: string;
  input: unknown;
};

export type SessionView = {
  id: string;
  title: string;
  status: SessionStatus;
  cwd?: string;
  messages: EnrichedMessage[];  // H-004: Use enriched messages with stable _clientId
  permissionRequests: PermissionRequest[];
  lastPrompt?: string;
  createdAt?: number;
  updatedAt?: number;
  hydrated: boolean;
};

interface AppState {
  sessions: Record<string, SessionView>;
  activeSessionId: string | null;
  prompt: string;
  cwd: string;
  pendingStart: boolean;
  globalError: string | null;
  sessionsLoaded: boolean;
  showStartModal: boolean;
  historyRequested: Set<string>;
  providers: SafeProviderConfig[];
  selectedProviderId: string | null;
  showProviderModal: boolean;

  setPrompt: (prompt: string) => void;
  setCwd: (cwd: string) => void;
  setPendingStart: (pending: boolean) => void;
  setGlobalError: (error: string | null) => void;
  setShowStartModal: (show: boolean) => void;
  setShowProviderModal: (show: boolean) => void;
  setActiveSessionId: (id: string | null) => void;
  setSelectedProviderId: (id: string | null) => void;
  markHistoryRequested: (sessionId: string) => void;
  resolvePermissionRequest: (sessionId: string, toolUseId: string) => void;
  setProviders: (providers: SafeProviderConfig[]) => void;
  addOrUpdateProvider: (provider: SafeProviderConfig) => void;
  removeProvider: (providerId: string) => void;
  handleServerEvent: (event: ServerEvent) => void;
}

function createSession(id: string): SessionView {
  return { id, title: "", status: "idle", messages: [], permissionRequests: [], hydrated: false };
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  prompt: "",
  cwd: "",
  pendingStart: false,
  globalError: null,
  sessionsLoaded: false,
  showStartModal: false,
  historyRequested: new Set(),
  providers: [],
  selectedProviderId: null,
  showProviderModal: false,

  setPrompt: (prompt) => set({ prompt }),
  setCwd: (cwd) => set({ cwd }),
  setPendingStart: (pendingStart) => set({ pendingStart }),
  setGlobalError: (globalError) => set({ globalError }),
  setShowStartModal: (showStartModal) => set({ showStartModal }),
  setShowProviderModal: (showProviderModal) => set({ showProviderModal }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setSelectedProviderId: (selectedProviderId) => set({ selectedProviderId }),

  markHistoryRequested: (sessionId) => {
    set((state) => {
      const next = new Set(state.historyRequested);
      next.add(sessionId);
      return { historyRequested: next };
    });
  },

  resolvePermissionRequest: (sessionId, toolUseId) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing) return {};
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            permissionRequests: existing.permissionRequests.filter(req => req.toolUseId !== toolUseId)
          }
        }
      };
    });
  },

  handleServerEvent: (event) => {
    const state = get();

    switch (event.type) {
      case "session.list": {
        const nextSessions: Record<string, SessionView> = {};
        for (const session of event.payload.sessions) {
          const existing = state.sessions[session.id] ?? createSession(session.id);
          nextSessions[session.id] = {
            ...existing,
            status: session.status,
            title: session.title,
            cwd: session.cwd,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt
          };
        }

        set({ sessions: nextSessions, sessionsLoaded: true });

        const hasSessions = event.payload.sessions.length > 0;
        set({ showStartModal: !hasSessions });

        if (!hasSessions) {
          get().setActiveSessionId(null);
        }

        if (!state.activeSessionId && event.payload.sessions.length > 0) {
          const sorted = [...event.payload.sessions].sort((a, b) => {
            const aTime = a.updatedAt ?? a.createdAt ?? 0;
            const bTime = b.updatedAt ?? b.createdAt ?? 0;
            return aTime - bTime;
          });
          const latestSession = sorted[sorted.length - 1];
          if (latestSession) {
            get().setActiveSessionId(latestSession.id);
          }
        } else if (state.activeSessionId) {
          const stillExists = event.payload.sessions.some(
            (session) => session.id === state.activeSessionId
          );
          if (!stillExists) {
            get().setActiveSessionId(null);
          }
        }
        break;
      }

      case "session.history": {
        const { sessionId, messages, status } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          // H-004: Enrich all history messages with stable _clientId for React reconciliation
          const enrichedMessages = messages.map(enrichMessage);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...existing, status, messages: enrichedMessages, hydrated: true }
            }
          };
        });
        break;
      }

      case "session.status": {
        const { sessionId, status, title, cwd } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                status,
                title: title ?? existing.title,
                cwd: cwd ?? existing.cwd,
                updatedAt: Date.now()
              }
            }
          };
        });

        if (state.pendingStart) {
          get().setActiveSessionId(sessionId);
          set({ pendingStart: false, showStartModal: false });
        }
        break;
      }

      case "session.deleted": {
        const { sessionId } = event.payload;
        const state = get();
        if (!state.sessions[sessionId]) break;
        const nextSessions = { ...state.sessions };
        delete nextSessions[sessionId];
        // H-003: Clean up historyRequested to prevent memory leak
        const nextHistoryRequested = new Set(state.historyRequested);
        nextHistoryRequested.delete(sessionId);
        set({
          sessions: nextSessions,
          historyRequested: nextHistoryRequested,
          showStartModal: Object.keys(nextSessions).length === 0
        });
        if (state.activeSessionId === sessionId) {
          const remaining = Object.values(nextSessions).sort(
            (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
          );
          get().setActiveSessionId(remaining[0]?.id ?? null);
        }
        break;
      }

      case "stream.message": {
        const { sessionId, message } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          // H-004: Enrich message with stable _clientId for React reconciliation
          // M-006: Apply message limit to prevent unbounded growth
          const newMessages = limitMessages([...existing.messages, enrichMessage(message)]);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...existing, messages: newMessages }
            }
          };
        });
        break;
      }

      case "stream.user_prompt": {
        const { sessionId, prompt } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          // H-004: Enrich user prompt with stable _clientId for React reconciliation
          // M-006: Apply message limit to prevent unbounded growth
          const userPromptMessage = enrichMessage({ type: "user_prompt" as const, prompt });
          const newMessages = limitMessages([...existing.messages, userPromptMessage]);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                messages: newMessages
              }
            }
          };
        });
        break;
      }

      case "permission.request": {
        const { sessionId, toolUseId, toolName, input } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                permissionRequests: [...existing.permissionRequests, { toolUseId, toolName, input }]
              }
            }
          };
        });
        break;
      }

      case "runner.error": {
        set({ globalError: event.payload.message });
        break;
      }

      case "provider.list": {
        set({ providers: event.payload.providers });
        break;
      }

      case "provider.saved": {
        const savedProvider = event.payload.provider;
        set((state) => {
          const existingIndex = state.providers.findIndex((p) => p.id === savedProvider.id);
          if (existingIndex >= 0) {
            const newProviders = [...state.providers];
            newProviders[existingIndex] = savedProvider;
            return { providers: newProviders };
          }
          return { providers: [...state.providers, savedProvider] };
        });
        break;
      }

      case "provider.deleted": {
        set((state) => ({
          providers: state.providers.filter((p) => p.id !== event.payload.providerId),
          selectedProviderId: state.selectedProviderId === event.payload.providerId ? null : state.selectedProviderId
        }));
        break;
      }

      case "provider.data": {
        // Handle single provider fetch if needed
        break;
      }
    }
  },

  setProviders: (providers) => set({ providers }),

  addOrUpdateProvider: (provider) => {
    set((state) => {
      const existingIndex = state.providers.findIndex((p) => p.id === provider.id);
      if (existingIndex >= 0) {
        const newProviders = [...state.providers];
        newProviders[existingIndex] = provider;
        return { providers: newProviders };
      }
      return { providers: [...state.providers, provider] };
    });
  },

  removeProvider: (providerId) => {
    set((state) => ({
      providers: state.providers.filter((p) => p.id !== providerId),
      selectedProviderId: state.selectedProviderId === providerId ? null : state.selectedProviderId
    }));
  }
}));
