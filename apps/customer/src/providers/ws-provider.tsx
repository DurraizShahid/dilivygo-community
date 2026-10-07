"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { createWSClient, type WSClient } from "@dilivygo/api";
import type { WSEvent } from "@dilivygo/types";
import { useQueryClient } from "@tanstack/react-query";
import { getAuthToken } from "@/stores/auth-store";
import { getResolvedProjectRef } from "@/lib/resolved-project-ref";

const WSContext = createContext<WSClient | null>(null);

const DEFAULT_API_URL =
  process.env.NODE_ENV === "production"
    ? "https://insightful-grace-production-9fd7.up.railway.app"
    : "http://localhost:8080";

const ENV_API_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
const WS_URL =
  typeof window === "undefined"
    ? ENV_API_URL.replace(/^http/, "ws") + "/ws"
    : process.env.NODE_ENV === "production"
      ? ENV_API_URL.replace(/^http/, "ws") + "/ws"
      : window.location.origin.replace(/^http/, "ws") + "/ws";

const API_BASE =
  typeof window === "undefined"
    ? ENV_API_URL.replace(/\/$/, "")
    : process.env.NODE_ENV === "production"
      ? ENV_API_URL.replace(/\/$/, "")
      : "";

const THEME_STORAGE_KEY = "dilivygo-customer-branding";
const THEME_APP_NAME = "customer_web";

async function refreshThemeFromServer(projectRef: string) {
  const ref = projectRef.trim();
  if (!ref) return;
  const qs = new URLSearchParams({ app: THEME_APP_NAME, ref });
  const res = await fetch(`${API_BASE}/api/public/theme?${qs}`, {
    credentials: "include",
  });
  if (!res.ok) return;
  const payload = await res.json();
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(
    new CustomEvent("dilivygo-theme-updated", {
      detail: { storageKey: THEME_STORAGE_KEY },
    })
  );
  try {
    const bc = new BroadcastChannel(`dilivygo-theme:${THEME_STORAGE_KEY}`);
    bc.postMessage({ storageKey: THEME_STORAGE_KEY, payload });
    bc.close();
  } catch {}
}

export function WSProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const client = useMemo(
    () => createWSClient(WS_URL, { getAuthToken: () => getAuthToken() }),
    []
  );

  useEffect(() => {
    client.connect();

    const unsubs = [
      client.subscribe("order:status_changed", (event) => {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        if (event.orderId) {
          queryClient.invalidateQueries({ queryKey: ["orders", event.orderId] });
        }
      }),
      client.subscribe("order:rejected", (event) => {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        if (event.orderId) {
          queryClient.invalidateQueries({ queryKey: ["orders", event.orderId] });
        }
      }),
      client.subscribe("order:delayed", (event) => {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        if (event.orderId) {
          queryClient.invalidateQueries({ queryKey: ["orders", event.orderId] });
        }
      }),
      client.subscribe("delivery:rider_assigned", (event) => {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        if (event.orderId) {
          queryClient.invalidateQueries({ queryKey: ["orders", event.orderId] });
        }
      }),
      client.subscribe("delivery:rider_arrived", (event) => {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        if (event.orderId) {
          queryClient.invalidateQueries({ queryKey: ["orders", event.orderId] });
        }
      }),
      client.subscribe("chat:message", () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["messages"] });
      }),
      client.subscribe("chat:support_status", () => {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }),
      client.subscribe("refund_request:updated", (event) => {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        if (event.orderId) {
          queryClient.invalidateQueries({ queryKey: ["orders", event.orderId] });
          queryClient.invalidateQueries({
            queryKey: ["customer-refund-request", event.orderId],
          });
        }
      }),
      client.subscribe("theme:updated", async () => {
        try {
          await refreshThemeFromServer(getResolvedProjectRef());
        } catch {}
      }),
    ];

    return () => {
      unsubs.forEach((u) => u());
      client.disconnect();
    };
  }, [client, queryClient]);

  return (
    <WSContext.Provider value={client}>
      {children}
    </WSContext.Provider>
  );
}

export function useWS() {
  return useContext(WSContext);
}

export function useWSEvent<T extends WSEvent["type"]>(
  eventType: T,
  handler: (event: Extract<WSEvent, { type: T }>) => void
) {
  const ws = useWS();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const stableHandler = useCallback(
    (event: Extract<WSEvent, { type: T }>) => handlerRef.current(event),
    []
  );

  useEffect(() => {
    if (!ws) return;
    return ws.subscribe(eventType, stableHandler);
  }, [ws, eventType, stableHandler]);
}
