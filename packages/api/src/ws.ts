import type { WSEvent } from "@dilivygo/types";

type Unsubscribe = () => void;
type EventHandler<T = WSEvent> = (event: T) => void;

export type WSClientOptions = {
  /**
   * Called before every (re)connect to obtain a bearer to append to the URL.
   * Used for staff/customer JWTs on React Native AND for short-lived SaaS
   * WebSocket handshake tickets (see `/api/saas/ws-ticket`).
   *
   * Returning `null` / throwing skips the param and the connect still
   * proceeds (useful when the token is optional).
   */
  getAuthToken?: () => string | null | Promise<string | null>;
  /**
   * Query-string key for the bearer returned by `getAuthToken`. Defaults to
   * `token` (matches the legacy mobile-app handshake). SaaS passes `ticket`
   * so the backend knows to look it up in the one-time-use ticket store
   * instead of trying to JWT-verify it.
   */
  tokenParam?: string;
};

export interface WSClient {
  connect(): void;
  disconnect(): void;
  /**
   * Close the current socket (if any) and immediately open a new one, forcing
   * `getAuthToken` (or `tokenParam`) to run again. Useful when the server-
   * side claims embedded in the bearer need to be refreshed — for example,
   * after a SaaS user creates or deletes a workspace, their ticket needs to
   * encode the new workspace list.
   */
  reconnect(): void;
  subscribe<T extends WSEvent["type"]>(
    eventType: T,
    handler: EventHandler<Extract<WSEvent, { type: T }>>
  ): Unsubscribe;
  send(data: Record<string, unknown>): void;
  isConnected(): boolean;
}

export function createWSClient(wsUrl: string, options?: WSClientOptions): WSClient {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectAttempt = 0;
  let intentionalClose = false;
  // Monotonic counter bumped every time `connect()` / `reconnect()` is invoked.
  // Each async `connect()` captures its own generation and aborts if a newer
  // call has already started — this prevents double-socket races when an
  // earlier handshake is still awaiting `getAuthToken()`.
  let connectGeneration = 0;

  const listeners = new Map<string, Set<EventHandler<any>>>();
  const getAuthToken = options?.getAuthToken;
  const tokenParam = options?.tokenParam || "token";

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return;
    intentionalClose = false;
    connectGeneration += 1;
    const myGeneration = connectGeneration;

    void (async () => {
      let connectUrl = wsUrl;
      if (getAuthToken) {
        try {
          const token = await Promise.resolve(getAuthToken());
          if (myGeneration !== connectGeneration) return;
          if (token) {
            const u = new URL(wsUrl);
            u.searchParams.set(tokenParam, token);
            connectUrl = u.toString();
          }
        } catch {
          if (myGeneration !== connectGeneration) return;
          // connect without token
        }
      }

      if (myGeneration !== connectGeneration) return;

      let socket: WebSocket;
      try {
        socket = new WebSocket(connectUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      ws = socket;

      socket.onopen = () => {
        if (myGeneration !== connectGeneration) {
          try {
            socket.close();
          } catch {
            // ignore
          }
          return;
        }
        reconnectAttempt = 0;
        startHeartbeat();
      };

      socket.onmessage = (event) => {
        if (myGeneration !== connectGeneration) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === "pong") return;
          const handlers = listeners.get(data.type);
          if (handlers) {
            handlers.forEach((h) => h(data));
          }
        } catch {
          // ignore malformed messages
        }
      };

      socket.onclose = () => {
        if (myGeneration !== connectGeneration) return;
        stopHeartbeat();
        if (!intentionalClose) scheduleReconnect();
      };

      socket.onerror = () => {
        if (myGeneration !== connectGeneration) return;
        try {
          socket.close();
        } catch {
          // ignore
        }
      };
    })();
  }

  function disconnect() {
    intentionalClose = true;
    connectGeneration += 1;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    stopHeartbeat();
    ws?.close();
    ws = null;
  }

  function reconnect() {
    // Close current socket, clear the "intentional close" flag, and fire a
    // fresh connect synchronously — the `onclose` handler below would have
    // scheduled an auto-reconnect, but we want no delay here.
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    stopHeartbeat();
    // Bump the generation first so any in-flight connect() observes the
    // mismatch and bails out before touching `ws`.
    connectGeneration += 1;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onopen = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
      ws = null;
    }
    reconnectAttempt = 0;
    connect();
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** reconnectAttempt, 30000);
    reconnectAttempt++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 25000);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function subscribe<T extends WSEvent["type"]>(
    eventType: T,
    handler: EventHandler<Extract<WSEvent, { type: T }>>
  ): Unsubscribe {
    if (!listeners.has(eventType)) {
      listeners.set(eventType, new Set());
    }
    listeners.get(eventType)!.add(handler);
    return () => {
      const set = listeners.get(eventType);
      if (!set) return;
      set.delete(handler);
      // Drop the key when the last handler goes away so the Map doesn't grow
      // unbounded when consumers subscribe/unsubscribe many distinct event
      // types over a session.
      if (set.size === 0) listeners.delete(eventType);
    };
  }

  function send(data: Record<string, unknown>) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  function isConnected() {
    return ws?.readyState === WebSocket.OPEN;
  }

  return { connect, disconnect, reconnect, subscribe, send, isConnected };
}
