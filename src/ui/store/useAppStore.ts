import { create } from 'zustand';
import type { ServerEvent, SessionStatus, StreamMessage } from "../types";

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
  messages: StreamMessage[];
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
  showSettingsModal: boolean;
  historyRequested: Set<string>;
  apiConfigChecked: boolean;

  setPrompt: (prompt: string) => void;
  setCwd: (cwd: string) => void;
  setPendingStart: (pending: boolean) => void;
  setGlobalError: (error: string | null) => void;
  setShowStartModal: (show: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  setActiveSessionId: (id: string | null) => void;
  setApiConfigChecked: (checked: boolean) => void;
  markHistoryRequested: (sessionId: string) => void;
  resolvePermissionRequest: (sessionId: string, toolUseId: string) => void;
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
  showSettingsModal: false,
  historyRequested: new Set(),
  apiConfigChecked: false,

  setPrompt: (prompt) => set({ prompt }),
  setCwd: (cwd) => set({ cwd }),
  setPendingStart: (pendingStart) => set({ pendingStart }),
  setGlobalError: (globalError) => set({ globalError }),
  setShowStartModal: (showStartModal) => set({ showStartModal }),
  setShowSettingsModal: (showSettingsModal) => set({ showSettingsModal }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setApiConfigChecked: (apiConfigChecked) => set({ apiConfigChecked }),

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
          const existingMsgCount = existing.messages.length;

          // Preserve ALL data from existing session if it's hydrated or has messages
          // session.list only provides metadata, not messages
          // This prevents session.list from wiping live streamed messages
          nextSessions[session.id] = {
            ...existing,
            // Only update metadata fields, keep messages and hydrated status
            status: existing.hydrated && existing.status !== "idle" ? existing.status : session.status,
            title: session.title || existing.title,
            cwd: session.cwd || existing.cwd,
            createdAt: session.createdAt ?? existing.createdAt,
            updatedAt: session.updatedAt ?? existing.updatedAt
          };

          // Log any potential issues
          if (existingMsgCount > 0) {
            console.log(`[Store] session.list: ${session.id.slice(0,8)} preserving ${existingMsgCount} messages (hydrated=${existing.hydrated})`);
          }
        }
        console.log(`[Store] session.list: ${event.payload.sessions.length} sessions`);

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

          // Keep existing messages only if we have MORE messages than incoming
          // OR if we're already hydrated (meaning we've received live data)
          // Don't just check status - a "completed" session from session.list
          // may have empty messages that need to be populated from history
          const hasMoreExistingMessages = existing.messages.length > messages.length;
          const shouldKeepExisting = hasMoreExistingMessages || (existing.hydrated && existing.messages.length > 0);

          const mergedMessages = shouldKeepExisting ? existing.messages : messages;
          const finalStatus = shouldKeepExisting ? existing.status : status;

          console.log(`[Store] session.history: existing=${existing.messages.length}, incoming=${messages.length}, keeping=${shouldKeepExisting ? 'existing' : 'incoming'}`);

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...existing, status: finalStatus, messages: mergedMessages, hydrated: true }
            }
          };
        });
        break;
      }

      case "session.status": {
        const { sessionId, status, title, cwd } = event.payload;
        console.log(`[Store] session.status: ${sessionId.slice(0,8)} -> ${status}, msgs=${state.sessions[sessionId]?.messages.length ?? 0}`);
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          // Mark as hydrated when session is running, completed, or error
          // This prevents history from overwriting live/recent data
          // Only "idle" sessions should potentially receive history updates
          const isActiveStatus = status === "running" || status === "completed" || status === "error";
          const shouldMarkHydrated = isActiveStatus || existing.hydrated;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                status,
                title: title ?? existing.title,
                cwd: cwd ?? existing.cwd,
                updatedAt: Date.now(),
                hydrated: shouldMarkHydrated
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

        const nextSessions = { ...state.sessions };
        delete nextSessions[sessionId];

        const nextHistoryRequested = new Set(state.historyRequested);
        nextHistoryRequested.delete(sessionId);

        const hasRemaining = Object.keys(nextSessions).length > 0;

        set({
          sessions: nextSessions,
          historyRequested: nextHistoryRequested,
          showStartModal: !hasRemaining
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
          // Deduplicate messages by checking if last message is identical
          // This handles duplicate events from React StrictMode's double connections
          const lastMessage = existing.messages[existing.messages.length - 1];
          if (lastMessage && JSON.stringify(lastMessage) === JSON.stringify(message)) {
            return {}; // Skip duplicate
          }
          const newMessages = [...existing.messages, message];
          if (newMessages.length % 10 === 0) {
            console.log(`[Store] Messages: ${newMessages.length}`);
          }
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
          const newMessage = { type: "user_prompt" as const, prompt };
          // Deduplicate user prompts too
          const lastMessage = existing.messages[existing.messages.length - 1];
          if (lastMessage && JSON.stringify(lastMessage) === JSON.stringify(newMessage)) {
            return {}; // Skip duplicate
          }
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                messages: [...existing.messages, newMessage]
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
    }
  }
}));
