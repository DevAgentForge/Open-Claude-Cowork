import { AnimatePresence, MotionConfig } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { useIPC } from "./hooks/useIPC";
import { useAppStore } from "./store/useAppStore";
import type { ServerEvent, SafeProviderConfig, ProviderSavePayload, EnrichedMessage } from "./types";
import { Sidebar } from "./components/Sidebar";
import { StartSessionModal } from "./components/StartSessionModal";
import { ProviderModal } from "./components/ProviderModal";
import { ThemeSettings } from "./components/ThemeSettings";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { PromptInput, usePromptActions } from "./components/PromptInput";
import { MessageCard } from "./components/EventCard";
import MDContent from "./render/markdown";
import { springPresets } from "./lib/animations";

/**
 * H-004: Generate stable key for message list items
 * Uses the _clientId generated at message ingestion time
 * This guarantees stable keys that don't change on reorder/filter operations
 */
function getMessageKey(msg: EnrichedMessage): string {
  // Primary: Use the stable _clientId generated at ingestion
  return msg._clientId;
}

// PERFORMANCE: Memoized message list to prevent unnecessary re-renders
const MessageList = memo(function MessageList({
  messages,
  isRunning,
  permissionRequest,
  onPermissionResult,
}: {
  messages: EnrichedMessage[];
  isRunning: boolean;
  permissionRequest: { toolUseId: string; toolName: string; input: unknown } | undefined;
  onPermissionResult: (toolUseId: string, result: PermissionResult) => void;
}) {
  return (
    <>
      {messages.map((msg, idx) => (
        <MessageCard
          key={getMessageKey(msg)}
          message={msg}
          isLast={idx === messages.length - 1}
          isRunning={isRunning}
          permissionRequest={idx === messages.length - 1 ? permissionRequest : undefined}
          onPermissionResult={onPermissionResult}
        />
      ))}
    </>
  );
});

// PERFORMANCE: Memoized streaming indicator
const StreamingIndicator = memo(function StreamingIndicator({
  partialMessage,
  showPartialMessage,
}: {
  partialMessage: string;
  showPartialMessage: boolean;
}) {
  return (
    <div className="partial-message">
      <MDContent text={partialMessage} isStreaming={showPartialMessage} />
      {showPartialMessage && (
        <div className="mt-3 flex flex-col gap-2 px-1">
          <div className="relative h-3 w-2/12 overflow-hidden rounded-full bg-ink-900/10">
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-900/10">
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-900/10">
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-900/10">
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
          </div>
          <div className="relative h-3 w-4/12 overflow-hidden rounded-full bg-ink-900/10">
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
          </div>
        </div>
      )}
    </div>
  );
});

function AppContent() {
  const { theme } = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const partialMessageRef = useRef("");
  const [partialMessage, setPartialMessage] = useState("");
  const [showPartialMessage, setShowPartialMessage] = useState(false);
  const [showThemeSettings, setShowThemeSettings] = useState(false);
  // M-008: Guard against state updates after unmount
  const isMountedRef = useRef(true);

  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const showStartModal = useAppStore((s) => s.showStartModal);
  const setShowStartModal = useAppStore((s) => s.setShowStartModal);
  const showProviderModal = useAppStore((s) => s.showProviderModal);
  const setShowProviderModal = useAppStore((s) => s.setShowProviderModal);
  const globalError = useAppStore((s) => s.globalError);
  const setGlobalError = useAppStore((s) => s.setGlobalError);
  const historyRequested = useAppStore((s) => s.historyRequested);
  const markHistoryRequested = useAppStore((s) => s.markHistoryRequested);
  const sessionsLoaded = useAppStore((s) => s.sessionsLoaded);
  const resolvePermissionRequest = useAppStore((s) => s.resolvePermissionRequest);
  const handleServerEvent = useAppStore((s) => s.handleServerEvent);
  const prompt = useAppStore((s) => s.prompt);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const cwd = useAppStore((s) => s.cwd);
  const setCwd = useAppStore((s) => s.setCwd);
  const pendingStart = useAppStore((s) => s.pendingStart);
  const removeProvider = useAppStore((s) => s.removeProvider);
  const [editingProvider, setEditingProvider] = useState<SafeProviderConfig | null>(null);

  // Helper function to extract partial message content
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getPartialMessageContent = useCallback((eventMessage: { delta: { type: string; [key: string]: any } }) => {
    try {
      const realType = eventMessage.delta.type.split("_")[0];
      return eventMessage.delta[realType];
    } catch (error) {
      console.error(error);
      return "";
    }
  }, []);

  // PERFORMANCE: Increased throttle to 100ms for smoother UI updates
  // Lower values cause too many re-renders and DOM thrashing
  const lastUpdateRef = useRef<number>(0);
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const THROTTLE_MS = 100; // Update UI at most every 100ms (was 50ms)

  // Handle partial messages from stream events with throttling
  const handlePartialMessages = useCallback((partialEvent: ServerEvent) => {
    if (partialEvent.type !== "stream.message" || partialEvent.payload.message.type !== "stream_event") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = partialEvent.payload.message as any;
    if (message.event.type === "content_block_start") {
      partialMessageRef.current = "";
      setPartialMessage("");
      setShowPartialMessage(true);
      lastUpdateRef.current = 0;
    }

    if (message.event.type === "content_block_delta") {
      partialMessageRef.current += getPartialMessageContent(message.event) || "";

      // Throttle UI updates for better performance
      const now = Date.now();
      if (now - lastUpdateRef.current >= THROTTLE_MS) {
        lastUpdateRef.current = now;
        setPartialMessage(partialMessageRef.current);
      } else if (!pendingUpdateRef.current) {
        // Schedule an update for the remaining throttle time
        pendingUpdateRef.current = setTimeout(() => {
          pendingUpdateRef.current = null;
          // M-008: Guard against state updates after unmount or session change
          if (!isMountedRef.current) return;
          lastUpdateRef.current = Date.now();
          setPartialMessage(partialMessageRef.current);
        }, THROTTLE_MS - (now - lastUpdateRef.current));
      }
    }

    if (message.event.type === "content_block_stop") {
      // Clear any pending update
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }
      // Final update with complete content
      setPartialMessage(partialMessageRef.current);
      setShowPartialMessage(false);
      // Delayed cleanup of partial message
      setTimeout(() => {
        partialMessageRef.current = "";
        setPartialMessage("");
      }, 500);
    }
  }, [getPartialMessageContent]);

  // Combined event handler
  const onEvent = useCallback((event: ServerEvent) => {
    handleServerEvent(event);
    handlePartialMessages(event);
  }, [handleServerEvent, handlePartialMessages]);

  const { connected, sendEvent } = useIPC(onEvent);
  const { handleStartFromModal } = usePromptActions(sendEvent);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const messages = useMemo(() => activeSession?.messages ?? [], [activeSession?.messages]);
  const permissionRequests = activeSession?.permissionRequests ?? [];
  const isRunning = activeSession?.status === "running";

  useEffect(() => {
    if (connected) {
      sendEvent({ type: "session.list" });
      sendEvent({ type: "provider.list" });
    }
  }, [connected, sendEvent]);

  useEffect(() => {
    if (!activeSessionId || !connected) return;
    const session = sessions[activeSessionId];
    if (session && !session.hydrated && !historyRequested.has(activeSessionId)) {
      markHistoryRequested(activeSessionId);
      sendEvent({ type: "session.history", payload: { sessionId: activeSessionId } });
    }
  }, [activeSessionId, connected, sessions, historyRequested, markHistoryRequested, sendEvent]);

  // Cleanup pendingUpdateRef on unmount to prevent memory leaks
  // M-008: Also set isMountedRef to false to guard against stale state updates
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }
    };
  }, []);

  // PERFORMANCE: Optimized scroll with requestAnimationFrame
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const SCROLL_DEBOUNCE_MS = 200; // Debounce instead of throttle

  useEffect(() => {
    // Clear existing timeout/raf
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    // Debounce scroll to avoid excessive DOM operations
    scrollTimeoutRef.current = setTimeout(() => {
      scrollTimeoutRef.current = null;
      // Use requestAnimationFrame for smooth scrolling
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }, SCROLL_DEBOUNCE_MS);

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [messages.length, showPartialMessage]);

  const handleNewSession = useCallback(() => {
    useAppStore.getState().setActiveSessionId(null);
    setShowStartModal(true);
  }, [setShowStartModal]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    sendEvent({ type: "session.delete", payload: { sessionId } });
  }, [sendEvent]);

  const handleOpenProviderSettings = useCallback((provider: SafeProviderConfig | null) => {
    setEditingProvider(provider);
    setShowProviderModal(true);
  }, [setShowProviderModal]);

  const handleOpenThemeSettings = useCallback(() => {
    setShowThemeSettings(true);
  }, []);

  const handleSaveProvider = useCallback((provider: ProviderSavePayload) => {
    // Send save request to main process
    // Main process will respond with SafeProviderConfig via provider.saved event
    sendEvent({ type: "provider.save", payload: { provider } });
  }, [sendEvent]);

  const handleDeleteProvider = useCallback((providerId: string) => {
    removeProvider(providerId);
    sendEvent({ type: "provider.delete", payload: { providerId } });
  }, [removeProvider, sendEvent]);

  const handlePermissionResult = useCallback((toolUseId: string, result: PermissionResult) => {
    if (!activeSessionId) return;
    sendEvent({ type: "permission.response", payload: { sessionId: activeSessionId, toolUseId, result } });
    resolvePermissionRequest(activeSessionId, toolUseId);
  }, [activeSessionId, sendEvent, resolvePermissionRequest]);

  const handleCloseProviderModal = useCallback(() => {
    setShowProviderModal(false);
    setEditingProvider(null);
  }, [setShowProviderModal]);

  const handleCloseThemeSettings = useCallback(() => {
    setShowThemeSettings(false);
  }, []);

  const handleCloseStartModal = useCallback(() => {
    setShowStartModal(false);
  }, [setShowStartModal]);

  const handleCloseError = useCallback(() => {
    setGlobalError(null);
  }, [setGlobalError]);

  return (
    <div className="flex h-screen" style={{ backgroundColor: theme.workspaceColor }}>
      <Sidebar
        connected={connected}
        isLoading={!sessionsLoaded}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onOpenProviderSettings={handleOpenProviderSettings}
        onOpenThemeSettings={handleOpenThemeSettings}
      />

      <main
        className="flex flex-1 flex-col ml-[300px]"
        style={{ backgroundColor: "var(--theme-workspace-color, #FAF9F6)" }}
      >
        <div
          className="flex items-center justify-center h-12 border-b border-ink-900/10 dark:border-white/10 select-none"
          style={{ WebkitAppRegion: 'drag', backgroundColor: "var(--theme-workspace-color, #FAF9F6)" } as React.CSSProperties}
        >
          <span className="text-sm font-medium text-ink-700 dark:text-white">{activeSession?.title || "Agent Cowork"}</span>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-40 pt-6">
          <div className="mx-auto max-w-3xl">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-lg font-medium text-ink-700">No messages yet</div>
                <p className="mt-2 text-sm text-muted">Start a conversation with Claude Code</p>
              </div>
            ) : (
              <MessageList
                messages={messages}
                isRunning={isRunning}
                permissionRequest={permissionRequests[0]}
                onPermissionResult={handlePermissionResult}
              />
            )}

            {/* Partial message display with skeleton loading */}
            <StreamingIndicator
              partialMessage={partialMessage}
              showPartialMessage={showPartialMessage}
            />

            <div ref={messagesEndRef} />
          </div>
        </div>

        <PromptInput sendEvent={sendEvent} />
      </main>

      {showStartModal && (
        <StartSessionModal
          cwd={cwd}
          prompt={prompt}
          pendingStart={pendingStart}
          onCwdChange={setCwd}
          onPromptChange={setPrompt}
          onStart={handleStartFromModal}
          onClose={handleCloseStartModal}
        />
      )}

      {globalError && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-error/20 bg-error-light px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm text-error">{globalError}</span>
            <button className="text-error hover:text-error/80" onClick={handleCloseError}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {showProviderModal && (
        <ProviderModal
          provider={editingProvider}
          onSave={handleSaveProvider}
          onDelete={handleDeleteProvider}
          onClose={handleCloseProviderModal}
        />
      )}

      {showThemeSettings && (
        <ThemeSettings onClose={handleCloseThemeSettings} />
      )}
    </div>
  );
}

// Main App component wrapped with ThemeProvider and Framer Motion
function App() {
  return (
    <ThemeProvider>
      <MotionConfig transition={springPresets.gentle}>
        <AnimatePresence mode="wait">
          <AppContent />
        </AnimatePresence>
      </MotionConfig>
    </ThemeProvider>
  );
}

export default App;
