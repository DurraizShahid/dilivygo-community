"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { createWSClient, type WSClient } from "@dilivygo/api";

const WSContext = createContext<WSClient | null>(null);

const DEFAULT_API_URL =
  process.env.NODE_ENV === "production"
    ? "https://insightful-grace-production-9fd7.up.railway.app"
    : "http://127.0.0.1:8080";
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

const THEME_STORAGE_KEY = "dilivygo-pos-branding";
const THEME_APP_NAME = "pos_web";

let themeRefCache: string | null = null;

async function resolveThemeRef(): Promise<string | null> {
  if (themeRefCache) return themeRefCache;
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const host = typeof window !== "undefined" ? window.location.host : "";
  const parts = hostname.split(".");
  if (parts.length >= 3 && parts[1] === "pos") {
    const slug = parts[0]?.trim();
    if (slug) {
      themeRefCache = slug;
      return slug;
    }
  }
  if (host) {
    const qs = new URLSearchParams({ host, surface: "pos" });
    const res = await fetch(`${API_BASE}/api/public/resolve-host?${qs}`, {
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

async function refreshThemeFromServer() {
  const ref = await resolveThemeRef();
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
  const client = useMemo(() => {
    return createWSClient(WS_URL);
  }, []);

  useEffect(() => {
    client.connect();
    const unsub = client.subscribe("theme:updated", async () => {
      try {
        await refreshThemeFromServer();
      } catch {}
    });
    return () => {
      unsub();
      client.disconnect();
    };
  }, [client]);

  return <WSContext.Provider value={client}>{children}</WSContext.Provider>;
}

export function useWS() {
  return useContext(WSContext);
}

