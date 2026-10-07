'use strict';

const logger = require('../lib/logger');
const { DEFAULT_CURRENCY } = require('../lib/currency');

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const _cache = new Map();

/**
 * Fetch exchange rates from Frankfurter API (free, no key needed).
 * Caches results for 1 hour per base currency.
 */
async function getRates(base = DEFAULT_CURRENCY) {
  const key = base.toLowerCase();
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const url = `https://api.frankfurter.dev/v1/latest?base=${key.toUpperCase()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Frankfurter API ${res.status}`);
    const json = await res.json();

    const data = {
      base: json.base?.toLowerCase() || key,
      rates: Object.fromEntries(
        Object.entries(json.rates || {}).map(([k, v]) => [k.toLowerCase(), v])
      ),
      date: json.date,
      updatedAt: new Date().toISOString(),
    };

    _cache.set(key, { data, fetchedAt: Date.now() });
    return data;
  } catch (err) {
    logger.warn('Exchange rate fetch failed', { base: key, error: err.message });
    if (cached) return cached.data;
    return { base: key, rates: {}, date: null, updatedAt: null };
  }
}

async function convert(amountCents, fromCurrency, toCurrency) {
  const from = (fromCurrency || '').toLowerCase();
  const to = (toCurrency || '').toLowerCase();
  if (!from || !to) return null;
  if (from === to) return amountCents;
  const data = await getRates(from);
  const rate = data.rates[to];
  if (!rate) return null;
  return Math.round(amountCents * rate);
}

module.exports = { getRates, convert };
