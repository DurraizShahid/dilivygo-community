import { useCallback, useEffect, useRef, useState } from "react";
import type { WSClient } from "@dilivygo/api";

/**
 * True while someone else is typing in the same conversation (WS `chat:typing`).
 */
export function usePeerTypingIndicator(
  ws: WSClient | null,
  conversationId: string | undefined,
  myUserId: string | undefined,
  idleMs = 4500
): boolean {
  const [peerTyping, setPeerTyping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!ws || !conversationId) return;
    return ws.subscribe("chat:typing", (event) => {
      if (event.conversationId !== conversationId) return;
      if (event.userId && event.userId === myUserId) return;
      if (event.isTyping) {
        if (timerRef.current) clearTimeout(timerRef.current);
        setPeerTyping(true);
        timerRef.current = setTimeout(() => setPeerTyping(false), idleMs);
      } else {
        setPeerTyping(false);
      }
    });
  }, [ws, conversationId, myUserId, idleMs]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return peerTyping;
}

/**
 * Emit `chat:typing` at most once per `minMs` while the user edits the composer.
 */
export function useThrottledTypingEmit(
  ws: WSClient | null,
  minMs = 1600
): (conversationId: string, userId: string | undefined) => void {
  const last = useRef(0);
  return useCallback(
    (conversationId: string, userId: string | undefined) => {
      if (!ws?.isConnected()) return;
      const n = Date.now();
      if (n - last.current < minMs) return;
      last.current = n;
      ws.send({
        type: "chat:typing",
        conversationId,
        userId,
        isTyping: true,
      });
    },
    [ws, minMs]
  );
}
