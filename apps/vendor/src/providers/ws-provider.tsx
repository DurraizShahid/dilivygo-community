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

const WSContext = createContext<WSClient | null>(null);

const PRODUCTION_HTTP = "https://insightful-grace-production-9fd7.up.railway.app";
function resolveWsHttpBase(): string {
  const env = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  if (env) return env;
  if (process.env.NODE_ENV === "production") return PRODUCTION_HTTP;
  // Match page hostname so cookies align with HTTP (localhost vs 127.0.0.1).
  if (typeof window !== "undefined") {
    return `http://${window.location.hostname}:8080`;
  }
  return "http://127.0.0.1:8080";
}

const THEME_STORAGE_KEY = "dilivygo-vendor-branding";
const THEME_APP_NAME = "vendor_web";

let themeRefCache: string | null = null;

async function resolveThemeRef(httpBase: string): Promise<string | null> {
  if (themeRefCache) return themeRefCache;
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const host = typeof window !== "undefined" ? window.location.host : "";
  const parts = hostname.split(".");
  if (parts.length >= 3 && parts[1] === "vendor") {
    const slug = parts[0]?.trim();
    if (slug) {
      themeRefCache = slug;
      return slug;
    }
  }
  if (host) {
    const qs = new URLSearchParams({ host, surface: "vendor" });
    const res = await fetch(`${httpBase}/api/public/resolve-host?${qs}`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = (await res.json()) as { projectRef?: string | null };
      const ref = typeof data.projectRef === "string" ? data.projectRef.trim() : "";
      if (ref) {
        themeRefCache = ref;
        return ref;
      }
    }
  }
  return null;
}

async function refreshThemeFromServer(httpBase: string) {
  const ref = await resolveThemeRef(httpBase);
  if (!ref) return;
  const qs = new URLSearchParams({ app: THEME_APP_NAME, ref });
  const res = await fetch(`${httpBase}/api/public/theme?${qs}`, {
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
  const client = useMemo(() => {
    const wsUrl = resolveWsHttpBase().replace(/^http/, "ws") + "/ws";
    return createWSClient(wsUrl);
  }, []);

  useEffect(() => {
    client.connect();

    const httpBase = resolveWsHttpBase();
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
      }),
      client.subscribe("theme:updated", async () => {
        try {
          await refreshThemeFromServer(httpBase);
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
