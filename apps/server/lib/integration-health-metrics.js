'use strict';

/**
 * Phase 15 — integration health / SLO metrics (in-memory, dependency-free).
 *
 * What this is: a tiny collision-free metrics registry for the integrations
 * platform. Webhook latency (acceptance vs processing), per-provider operation
 * outcomes, retry/DLQ counts, sync-lag gauges, credential-health states, and
 * reconciliation discrepancy counters — all aggregated in memory with a
 * `snapshot()` projection consumed by `GET /api/saas/integrations/health`
 * (`metrics` section) and a `reset()` hook for tests / operational resets.
 *
 * What this is NOT:
 *   - Not a Prometheus client, not a StatsD emitter, not persisted. Process
 *     restart clears it. A future phase may forward `snapshot()` to the
 *     metrics backend of choice without changing call sites.
 *   - Not a replacement for structured logs or Sentry. `emitAlert()` writes a
 *     `logger.warn/error` line tagged `alert:true` plus a Sentry-breadcrumb
 *     shaped payload in the log context so the existing log pipeline (and any
 *     future Sentry `addBreadcrumb` wiring) can pick it up. It deliberately
 *     does NOT `require('@sentry/node')` (heavy client) — it goes through the
 *     local `lib/sentry.js` capability check only.
 *
 * Conventions:
 *   - Every recorder validates and normalizes its input and NEVER throws —
 *     metrics must not fail domain work. Invalid input returns `false`.
 *   - Keys are bounded (evict-oldest at MAX_KEYS) so a cardinality explosion
 *     (e.g. attacker-controlled provider strings) cannot leak memory.
 *   - No secrets, tokens, payloads, or PII are ever stored. Only provider
 *     keys, operation names, counts, latencies, and short reason codes.
 */

const logger = require('./logger');

const WEBHOOK_LATENCY_BUCKETS_MS = Object.freeze([50, 100, 250, 500, 1000, 2500, 5000, 10000]);
const OPERATION_OUTCOMES = new Set(['success', 'failure']);
const CREDENTIAL_STATES = new Set([
  'connected',
  'expiring',
  'expired',
  'revoked',
  'error',
  'unknown',
]);
const MAX_KEYS = 500;
const MAX_REASON_CHARS = 200;
const MAX_NAME_CHARS = 120;

function normalizeName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase().slice(0, MAX_NAME_CHARS);
  if (!trimmed || !/^[a-z0-9][a-z0-9._-]*$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeReason(value) {
  if (value == null) return null;
  return String(value).slice(0, MAX_REASON_CHARS) || null;
}

function touchBounded(map, key, make) {
  if (map.has(key)) return map.get(key);
  if (map.size >= MAX_KEYS) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
  }
  const entry = make();
  map.set(key, entry);
  return entry;
}

function emptyLatency() {
  return { buckets: Object.fromEntries(WEBHOOK_LATENCY_BUCKETS_MS.map((b) => [String(b), 0])), count: 0, sumMs: 0 };
}

const _webhookLatency = {
  acceptance: emptyLatency(),
  processing: emptyLatency(),
};
// `${provider}:${operation}` -> { provider, operation, success, failure }
const _operations = new Map();
// `${provider}:${operation}` -> { provider, operation, count }
const _retries = new Map();
// `${provider}:${operation}` -> { provider, operation, count, lastReason, lastAt }
const _dlq = new Map();
// provider -> { provider, lagMs, measuredAt }
const _syncLag = new Map();
// provider -> { provider, state, updatedAt }
const _credentials = new Map();
// `${provider}:${kind}` -> { provider, kind, count }
const _reconciliation = new Map();
// Alert subscriber hooks (observability fan-out; default sink is the logger).
const _alertHooks = new Set();

function observeWebhookLatency(stage, latencyMs) {
  const bucket = _webhookLatency[String(stage || '').trim().toLowerCase()];
  if (!bucket) return false;
  const ms = Number(latencyMs);
  if (!Number.isFinite(ms) || ms < 0) return false;
  const clamped = Math.min(ms, 24 * 60 * 60 * 1000);
  for (const boundary of WEBHOOK_LATENCY_BUCKETS_MS) {
    if (clamped <= boundary) bucket.buckets[String(boundary)] += 1;
  }
  bucket.count += 1;
  bucket.sumMs += clamped;
  return true;
}

function recordOperation({ provider, operation, outcome } = {}) {
  const p = normalizeName(provider);
  const op = normalizeName(operation);
  const out = String(outcome || '').trim().toLowerCase();
  if (!p || !op || !OPERATION_OUTCOMES.has(out)) return false;
  const entry = touchBounded(_operations, `${p}:${op}`, () => ({ provider: p, operation: op, success: 0, failure: 0 }));
  entry[out] += 1;
  return true;
}

function recordRetry({ provider, operation } = {}) {
  const p = normalizeName(provider);
  const op = normalizeName(operation);
  if (!p || !op) return false;
  const entry = touchBounded(_retries, `${p}:${op}`, () => ({ provider: p, operation: op, count: 0 }));
  entry.count += 1;
  return true;
}

function recordDlq({ provider, operation, reason = null } = {}) {
  const p = normalizeName(provider);
  const op = normalizeName(operation);
  if (!p || !op) return false;
  const entry = touchBounded(_dlq, `${p}:${op}`, () => ({
    provider: p, operation: op, count: 0, lastReason: null, lastAt: null,
  }));
  entry.count += 1;
  entry.lastReason = normalizeReason(reason);
  entry.lastAt = new Date().toISOString();
  // A dead-lettered integration delivery is operator-actionable: emit an
  // alert every time (count included so receivers can throttle).
  emitAlert('error', `Integration delivery dead-lettered (${p}/${op})`, {
    provider: p,
    operation: op,
    dlqCount: entry.count,
    reason: entry.lastReason,
  });
  return true;
}

function setSyncLagMs({ provider, lagMs } = {}) {
  const p = normalizeName(provider);
  const ms = Number(lagMs);
  if (!p || !Number.isFinite(ms) || ms < 0) return false;
  touchBounded(_syncLag, p, () => ({ provider: p, lagMs: 0, measuredAt: null }));
  _syncLag.set(p, { provider: p, lagMs: Math.min(Math.round(ms), 30 * 24 * 60 * 60 * 1000), measuredAt: new Date().toISOString() });
  return true;
}

function setCredentialState({ provider, state } = {}) {
  const p = normalizeName(provider);
  const s = String(state || '').trim().toLowerCase();
  if (!p || !CREDENTIAL_STATES.has(s)) return false;
  const prev = _credentials.get(p)?.state || null;
  _credentials.set(p, { provider: p, state: s, updatedAt: new Date().toISOString() });
  // Transitions into non-healthy credential states are operator-actionable
  // (reconnect / rotate / re-authorize per the provider runbook).
  if (prev !== s && (s === 'expired' || s === 'revoked' || s === 'error')) {
    emitAlert('warn', `Integration credential needs attention (${p}: ${s})`, {
      provider: p,
      credentialState: s,
      previousState: prev,
    });
  }
  return true;
}

function recordReconciliationDiscrepancy({ provider, kind } = {}) {
  const p = normalizeName(provider);
  const k = normalizeName(kind);
  if (!p || !k) return false;
  const entry = touchBounded(_reconciliation, `${p}:${k}`, () => ({ provider: p, kind: k, count: 0 }));
  entry.count += 1;
  return true;
}

/**
 * Alerting hook. Writes a structured log line tagged `alert:true` (so log
 * alerting rules can match on it) with a Sentry-breadcrumb shaped `breadcrumb`
 * payload, then fans out to any registered `onAlert` subscribers. Never
 * throws; never includes secrets (callers must pass reason codes, not raw
 * provider responses).
 *
 * Breadcrumb shape mirrors `@sentry/node` `addBreadcrumb`:
 * `{ type, category, level, message, data, timestamp }`.
 */
function emitAlert(level, message, context = {}) {
  try {
    const normalizedLevel = level === 'error' ? 'error' : 'warn';
    const safeMessage = String(message || 'Integration alert').slice(0, 500);
    const data = {};
    if (context && typeof context === 'object' && !Array.isArray(context)) {
      for (const [key, value] of Object.entries(context)) {
        if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
          data[String(key).slice(0, 64)] = typeof value === 'string' ? value.slice(0, 500) : value;
        }
      }
    }
    const breadcrumb = {
      type: 'default',
      category: 'integrations.health',
      level: normalizedLevel,
      message: safeMessage,
      data,
      timestamp: new Date().toISOString(),
    };
    const logPayload = { alert: true, breadcrumb, ...data };
    if (normalizedLevel === 'error') logger.error(safeMessage, logPayload);
    else logger.warn(safeMessage, logPayload);
    for (const hook of _alertHooks) {
      try {
        hook({ level: normalizedLevel, message: safeMessage, breadcrumb });
      } catch {
        // Subscriber failures must never break the emitter.
      }
    }
    return breadcrumb;
  } catch {
    return null;
  }
}

function onAlert(fn) {
  if (typeof fn !== 'function') return () => {};
  _alertHooks.add(fn);
  return () => { _alertHooks.delete(fn); };
}

function snapshotLatency(bucket) {
  return {
    buckets: { ...bucket.buckets },
    count: bucket.count,
    sumMs: bucket.sumMs,
    avgMs: bucket.count > 0 ? bucket.sumMs / bucket.count : null,
  };
}

function snapshot() {
  const operations = [..._operations.values()].map((entry) => {
    const total = entry.success + entry.failure;
    return {
      provider: entry.provider,
      operation: entry.operation,
      success: entry.success,
      failure: entry.failure,
      total,
      failureRate: total > 0 ? entry.failure / total : null,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    webhookLatency: {
      acceptance: snapshotLatency(_webhookLatency.acceptance),
      processing: snapshotLatency(_webhookLatency.processing),
    },
    operations,
    retries: [..._retries.values()].map((entry) => ({ ...entry })),
    dlq: [..._dlq.values()].map((entry) => ({ ...entry })),
    syncLagMs: [..._syncLag.values()].map((entry) => ({ ...entry })),
    credentials: [..._credentials.values()].map((entry) => ({ ...entry })),
    reconciliation: [..._reconciliation.values()].map((entry) => ({ ...entry })),
  };
}

function reset() {
  _webhookLatency.acceptance = emptyLatency();
  _webhookLatency.processing = emptyLatency();
  _operations.clear();
  _retries.clear();
  _dlq.clear();
  _syncLag.clear();
  _credentials.clear();
  _reconciliation.clear();
}

module.exports = {
  WEBHOOK_LATENCY_BUCKETS_MS,
  observeWebhookLatency,
  recordOperation,
  recordRetry,
  recordDlq,
  setSyncLagMs,
  setCredentialState,
  recordReconciliationDiscrepancy,
  emitAlert,
  onAlert,
  snapshot,
  reset,
};
