"use client";

import { useEffect, useRef, useState } from "react";

interface ExchangeRateData {
  base: string;
  rates: Record<string, number>;
  date: string | null;
}

const cache = new Map<string, { data: ExchangeRateData; at: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export function useExchangeRates(
  base: string,
  apiUrl?: string,
): { rates: Record<string, number> | null; loading: boolean } {
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const prevKey = useRef("");

  const key = (base || "").trim().toLowerCase();

  useEffect(() => {
    if (!key) {
      setRates(null);
      return;
    }

    if (key === prevKey.current) return;
    prevKey.current = key;

    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      setRates(cached.data.rates);
      return;
    }

    setLoading(true);

    const url = apiUrl
      ? `${apiUrl}/api/public/exchange-rates?base=${key}`
      : `/api/public/exchange-rates?base=${key}`;

    fetch(url, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.rates) {
          cache.set(key, { data, at: Date.now() });
          setRates(data.rates);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [key, apiUrl]);

  return { rates, loading };
}

export function convertCents(
  cents: number,
  rates: Record<string, number> | null,
  toCurrency: string,
): number | null {
  if (!rates) return null;
  const rate = rates[toCurrency.toLowerCase()];
  if (!rate) return null;
  return Math.round(cents * rate);
}
