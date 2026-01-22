import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerEvent, ClientEvent } from "../types";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";
const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_ATTEMPTS = 5;

// Singleton WebSocket state - shared across all hook instances
let globalWs: WebSocket | null = null;
let globalConnecting = false;
let globalEventHandler: ((event: ServerEvent) => void) | null = null;
let connectionCount = 0;
let lastActivityTime = 0;

export function useWebSocket(onEvent: (event: ServerEvent) => void) {
  const [connected, setConnected] = useState(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const isOwnerRef = useRef(false);

  // Keep onEvent ref updated
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(async () => {
    connectionCount++;

    // If already connected or connecting, just use existing connection
    if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) {
      setConnected(globalWs.readyState === WebSocket.OPEN);
      return;
    }

    // If another instance is already connecting, wait
    if (globalConnecting) {
      // Wait a bit for the connection to establish
      setTimeout(() => {
        if (globalWs?.readyState === WebSocket.OPEN) {
          setConnected(true);
        }
      }, 100);
      return;
    }

    // This instance becomes the owner of the connection
    isOwnerRef.current = true;
    globalConnecting = true;

    // Set the global event handler (only one handler, called once per message)
    globalEventHandler = (event: ServerEvent) => {
      onEventRef.current(event);
    };

    // Get auth token if available
    let token = "";
    try {
      token = await window.electron?.getAuthToken?.() || "";
    } catch {
      // No auth token available
    }
    const url = token ? `${WS_URL}?token=${token}` : WS_URL;

    console.log("[WebSocket] Creating new connection...");
    const ws = new WebSocket(url);
    globalWs = ws;

    ws.onopen = () => {
      console.log("[WebSocket] Connected");
      globalConnecting = false;
      setConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        lastActivityTime = Date.now();
        const data = JSON.parse(event.data) as ServerEvent;
        if (data.type === "stream.message" || data.type === "session.status" || data.type === "session.history") {
          console.log(`[WS] Received: ${data.type}`);
        }
        // Only call the handler once, regardless of how many hook instances exist
        globalEventHandler?.(data);
      } catch (error) {
        console.error("[WebSocket] Failed to parse message:", error);
      }
    };

    ws.onclose = (event) => {
      console.log("[WebSocket] Disconnected:", event.code, event.reason);
      globalConnecting = false;
      setConnected(false);
      globalWs = null;

      // Only the owner should attempt to reconnect
      if (isOwnerRef.current && event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1);
        console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      globalConnecting = false;
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      connectionCount--;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      // Only close if this was the owner and no other connections need it
      // Also don't close if there was recent activity (indicates StrictMode double-render)
      const timeSinceActivity = Date.now() - lastActivityTime;
      const isRecentActivity = timeSinceActivity < 1000;
      if (isOwnerRef.current && connectionCount === 0 && globalWs && !isRecentActivity) {
        console.log("[WebSocket] Closing connection (no more users)");
        globalWs.close(1000);
        globalWs = null;
        globalEventHandler = null;
      } else if (isOwnerRef.current && connectionCount === 0 && isRecentActivity) {
        console.log("[WebSocket] Keeping connection alive (recent activity, likely StrictMode)");
      }
    };
  }, [connect]);

  const sendEvent = useCallback((event: ClientEvent) => {
    if (globalWs?.readyState === WebSocket.OPEN) {
      globalWs.send(JSON.stringify(event));
    } else {
      console.warn("[WebSocket] Cannot send event - not connected");
    }
  }, []);

  return { connected, sendEvent };
}
