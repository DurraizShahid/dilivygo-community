'use strict';

const crypto = require('crypto');
const config = require('../config');
const { select, insert, update } = require('../lib/supabase');
const logger = require('../lib/logger');
// Deferred-wiring batch (connection-model migration, behavior-identical):
// `listConnections` reads through the org-scoped model below. `findConnection`
// / `markPending` / `disconnect` intentionally stay on direct Supabase — the
// model adds a `select` allowlist key and object-shaped (non-array) inserts
// plus an extra internal find, which the exact-shape assertions in
// `tests/integration-connections.service.test.js:142,158`,
// `tests/integration-chaos.test.js:327` and
// `tests/integration-security-isolation.test.js:90-108` pin down. Migrating
// those hunks breaks green tests, so they are reported as blocked instead.
const connectionModel = require('../models/integration-connection.model');
const catalog = require('../../../integrations/catalog.json');

const nangoCatalog = catalog.filter((item) => item.type === 'nango');
const nativeCatalog = catalog.filter((item) => item.type === 'native');

const PROVIDERS = Object.freeze(Object.fromEntries(
  nangoCatalog.map((item) => [item.key, Object.freeze({
    key: item.key,
    displayName: item.name,
    category: item.category,
    type: 'nango',
    integrationId: item.integrationId || item.key,
    priority: item.priority || 'extended',
    capabilities: item.capabilities || [],
    requiresProviderApproval: Boolean(item.requiresProviderApproval),
  })]),
));

const nativeConfigured = {
  stripe: () => Boolean(config.stripe.enabled),
  'stripe-connect': () => Boolean(config.stripe.enabled),
  'apple-pay': () => Boolean(config.stripe.enabled),
  'google-pay': () => Boolean(config.stripe.enabled),
  'google-maps': () => Boolean(config.google.mapsApiKey),
  'firebase-fcm': () => Boolean(config.firebase.enabled),
  twilio: () => Boolean(config.twilio.enabled),
};

const nativeManagedBy = {
  'apple-pay': 'stripe',
  'google-pay': 'stripe',
};

const NATIVE_PROVIDERS = Object.freeze(nativeCatalog.map((item) => Object.freeze({
  key: item.key,
  displayName: item.name,
  category: item.category,
  type: 'native',
  priority: item.priority || 'core',
  capabilities: item.capabilities || [],
  managedBy: nativeManagedBy[item.key] || null,
  configured: nativeConfigured[item.key] || (() => false),
})));

const CONNECT_SESSION_TTL_MS = 30 * 60 * 1000;
const ALLOWED_PROXY_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const RESERVED_PROXY_HEADERS = new Set([
  'authorization',
  'connection-id',
  'provider-config-key',
  'base-url-override',
  'host',
  'cookie',
  'content-length',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
]);

function integrationError(message, statusCode = 400, code = 'INTEGRATION_ERROR') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function getProvider(providerKey) {
  return PROVIDERS[String(providerKey || '').trim().toLowerCase()] || null;
}

function resolveIntegrationId(provider) {
  const overrides = config.nango?.integrationIds || {};
  return overrides[provider.key] || provider.integrationId;
}

function assertNangoConfigured() {
  if (!config.nango?.enabled) {
    throw integrationError('Nango is not configured for this environment', 503, 'NANGO_NOT_CONFIGURED');
  }
}

function nangoConfigured() {
  return Boolean(config.nango?.enabled);
}

function allowlistedIntegrationKeys() {
  const raw = config.nango?.enabledIntegrations;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return new Set(raw.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
}

function isProviderAvailable(provider) {
  if (!nangoConfigured()) return false;
  const allowlist = allowlistedIntegrationKeys();
  if (!allowlist) return true;
  return (
    allowlist.has(String(provider.key).toLowerCase()) ||
    allowlist.has(String(resolveIntegrationId(provider)).toLowerCase())
  );
}

function assertProviderAvailable(provider) {
  if (isProviderAvailable(provider)) return;
  if (!nangoConfigured()) {
    throw integrationError('Nango is not configured for this environment', 503, 'NANGO_NOT_CONFIGURED');
  }
  throw integrationError(
    `${provider.displayName} is not enabled for this environment`,
    409,
    'PROVIDER_NOT_CONFIGURED',
  );
}

async function nangoFetch(path, options = {}) {
  assertNangoConfigured();
  const response = await fetch(`${config.nango.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.nango.secretKey}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  const raw = await response.text();
  let body = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  if (!response.ok) {
    const message =
      body?.error?.message ||
      body?.error ||
      body?.message ||
      (typeof body === 'string' ? body : null) ||
      `Nango request failed (${response.status})`;
    const err = integrationError(String(message), response.status >= 500 ? 502 : response.status, 'NANGO_UPSTREAM_ERROR');
    err.nangoStatus = response.status;
    err.nangoBody = body;
    throw err;
  }

  return body;
}

async function findConnection(organizationId, providerKey) {
  const rows = await select('integration_connections', {
    filters: { organization_id: organizationId, provider_key: providerKey },
    limit: 1,
  });
  return rows?.[0] || null;
}

async function requireConnectedConnection(organizationId, providerKey) {
  const provider = getProvider(providerKey);
  if (!provider) throw integrationError('Unsupported integration provider', 404, 'INTEGRATION_NOT_FOUND');
  const row = await findConnection(organizationId, provider.key);
  if (!row || row.status !== 'connected' || !row.connection_id) {
    throw integrationError(`Connect ${provider.displayName} before using its data routes`, 409, 'INTEGRATION_NOT_CONNECTED');
  }
  return { provider, row };
}

async function markPending(organizationId, provider, integrationId) {
  const existing = await findConnection(organizationId, provider.key);
  const now = new Date().toISOString();
  if (existing) {
    const rows = await update(
      'integration_connections',
      {
        nango_integration_id: integrationId,
        status: 'pending',
        disconnected_at: null,
        updated_at: now,
      },
      { id: existing.id },
    );
    return rows?.[0] || existing;
  }

  const rows = await insert('integration_connections', [{
    organization_id: organizationId,
    provider_key: provider.key,
    nango_integration_id: integrationId,
    status: 'pending',
    created_at: now,
    updated_at: now,
  }]);
  return rows?.[0] || null;
}

async function createConnectSession({ organizationId, userId, providerKey }) {
  const provider = getProvider(providerKey);
  if (!provider) throw integrationError('Unsupported integration provider', 404, 'INTEGRATION_NOT_FOUND');
  assertProviderAvailable(provider);

  const existing = await findConnection(organizationId, provider.key);
  if (existing?.status === 'connected' && existing.connection_id) {
    throw integrationError(`${provider.displayName} is already connected`, 409, 'INTEGRATION_ALREADY_CONNECTED');
  }

  const integrationId = resolveIntegrationId(provider);
  const body = await nangoFetch('/connect/sessions', {
    method: 'POST',
    body: JSON.stringify({
      tags: {
        end_user_id: String(userId),
        organization_id: String(organizationId),
        integration_key: provider.key,
      },
      allowed_integrations: [integrationId],
    }),
  });

  await markPending(organizationId, provider, integrationId);
  const data = body?.data || body || {};
  return {
    provider: provider.key,
    integrationId,
    token: data.token || null,
    connectLink: data.connect_link || null,
    expiresAt: data.expires_at || null,
  };
}

async function createReconnectSession({ organizationId, userId, providerKey }) {
  const provider = getProvider(providerKey);
  if (!provider) throw integrationError('Unsupported integration provider', 404, 'INTEGRATION_NOT_FOUND');
  assertProviderAvailable(provider);

  const existing = await findConnection(organizationId, provider.key);
  if (!existing?.connection_id) {
    return createConnectSession({ organizationId, userId, providerKey });
  }

  const integrationId = existing.nango_integration_id || resolveIntegrationId(provider);
  const body = await nangoFetch('/connect/sessions/reconnect', {
    method: 'POST',
    body: JSON.stringify({
      connection_id: existing.connection_id,
      integration_id: integrationId,
      tags: {
        end_user_id: String(userId),
        organization_id: String(organizationId),
        integration_key: provider.key,
      },
    }),
  });
  const data = body?.data || body || {};
  return {
    provider: provider.key,
    integrationId,
    token: data.token || null,
    connectLink: data.connect_link || null,
    expiresAt: data.expires_at || null,
  };
}

async function disconnect({ organizationId, providerKey }) {
  const provider = getProvider(providerKey);
  if (!provider) throw integrationError('Unsupported integration provider', 404, 'INTEGRATION_NOT_FOUND');

  const existing = await findConnection(organizationId, provider.key);
  if (!existing) return { success: true, alreadyDisconnected: true };

  if (existing.connection_id && config.nango?.enabled) {
    const integrationId = existing.nango_integration_id || resolveIntegrationId(provider);
    try {
      await nangoFetch(
        `/connections/${encodeURIComponent(existing.connection_id)}?provider_config_key=${encodeURIComponent(integrationId)}`,
        { method: 'DELETE' },
      );
    } catch (err) {
      if (err.nangoStatus !== 404) throw err;
    }
  }

  const now = new Date().toISOString();
  await update(
    'integration_connections',
    {
      connection_id: null,
      status: 'disconnected',
      disconnected_at: now,
      updated_at: now,
    },
    { id: existing.id },
  );
  return { success: true };
}

function normalizeStoredStatus(row) {
  if (!row) return 'not_connected';
  if (row.status !== 'pending') return row.status;
  const updatedAt = Date.parse(row.updated_at || row.created_at || '');
  if (!Number.isFinite(updatedAt)) return row.status;
  return Date.now() - updatedAt > CONNECT_SESSION_TTL_MS ? 'not_connected' : row.status;
}

async function listConnections(organizationId) {
  // Model-backed read: `listByOrganization` issues the same tenant-scoped
  // query (organization_id filter, created_at.asc, limit 250) with an explicit
  // SAFE_COLUMNS projection. Every column consumed below (provider_key,
  // nango_integration_id, connection_id, status, connected_at,
  // disconnected_at) is in that projection, so the mapped shapes are
  // identical — verified by `tests/deferred-wiring.test.js` (parity section).
  const rows = await connectionModel.listByOrganization(organizationId);
  const byProvider = new Map((rows || []).map((row) => [row.provider_key, row]));

  const nango = Object.values(PROVIDERS).map((provider) => {
    const row = byProvider.get(provider.key);
    return {
      key: provider.key,
      displayName: provider.displayName,
      category: provider.category,
      type: provider.type,
      priority: provider.priority,
      capabilities: provider.capabilities,
      requiresProviderApproval: provider.requiresProviderApproval,
      integrationId: row?.nango_integration_id || resolveIntegrationId(provider),
      status: normalizeStoredStatus(row),
      connectionId: row?.connection_id || null,
      connectedAt: row?.connected_at || null,
      disconnectedAt: row?.disconnected_at || null,
      available: isProviderAvailable(provider),
      nangoConfigured: nangoConfigured(),
    };
  });

  const native = NATIVE_PROVIDERS.map((provider) => ({
    key: provider.key,
    displayName: provider.displayName,
    category: provider.category,
    type: provider.type,
    priority: provider.priority,
    capabilities: provider.capabilities,
    managedBy: provider.managedBy,
    status: provider.configured() ? 'configured' : 'needs_configuration',
    available: true,
  }));

  return [...native, ...nango];
}

function normalizeProxyEndpoint(endpoint) {
  const value = String(endpoint || '').trim();
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('://') ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.includes('?') ||
    value.includes('#') ||
    value.split('/').includes('..') ||
    value.length > 2048
  ) {
    throw integrationError('endpoint must be a safe relative provider API path', 400, 'INVALID_PROXY_ENDPOINT');
  }
  return value;
}

function normalizeProxyMethod(method) {
  const value = String(method || 'GET').trim().toUpperCase();
  if (!ALLOWED_PROXY_METHODS.has(value)) {
    throw integrationError('Unsupported proxy method', 400, 'INVALID_PROXY_METHOD');
  }
  return value;
}

function normalizeProxyQuery(query) {
  if (query == null) return '';
  if (typeof query !== 'object' || Array.isArray(query)) {
    throw integrationError('query must be an object', 400, 'INVALID_PROXY_QUERY');
  }
  const params = new URLSearchParams();
  const entries = Object.entries(query);
  if (entries.length > 50) throw integrationError('Too many proxy query parameters', 400, 'INVALID_PROXY_QUERY');
  for (const [key, raw] of entries) {
    if (!/^[A-Za-z0-9_.\-[\]]{1,128}$/.test(key)) {
      throw integrationError('Invalid proxy query parameter name', 400, 'INVALID_PROXY_QUERY');
    }
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        throw integrationError('Proxy query values must be scalar', 400, 'INVALID_PROXY_QUERY');
      }
      params.append(key, String(value));
    }
  }
  const suffix = params.toString();
  return suffix ? `?${suffix}` : '';
}

function normalizeProxyHeaders(headers) {
  if (headers == null) return {};
  if (typeof headers !== 'object' || Array.isArray(headers)) {
    throw integrationError('headers must be an object', 400, 'INVALID_PROXY_HEADERS');
  }
  const entries = Object.entries(headers);
  if (entries.length > 20) throw integrationError('Too many proxy headers', 400, 'INVALID_PROXY_HEADERS');
  const result = {};
  for (const [name, rawValue] of entries) {
    const lower = String(name).trim().toLowerCase();
    if (!/^[a-z0-9-]{1,128}$/.test(lower) || RESERVED_PROXY_HEADERS.has(lower)) {
      throw integrationError(`Header ${name} is not allowed`, 400, 'INVALID_PROXY_HEADERS');
    }
    if (!['string', 'number', 'boolean'].includes(typeof rawValue)) {
      throw integrationError('Proxy header values must be scalar', 400, 'INVALID_PROXY_HEADERS');
    }
    result[`nango-proxy-${name}`] = String(rawValue);
  }
  return result;
}

async function proxyRequest({ organizationId, providerKey, method, endpoint, query, data, headers, retries = 2 }) {
  const { provider, row } = await requireConnectedConnection(organizationId, providerKey);
  const safeEndpoint = normalizeProxyEndpoint(endpoint);
  const safeMethod = normalizeProxyMethod(method);
  const querySuffix = normalizeProxyQuery(query);
  const integrationId = row.nango_integration_id || resolveIntegrationId(provider);
  const retryCount = Math.min(5, Math.max(0, Number.parseInt(String(retries), 10) || 0));
  const body = ['GET', 'DELETE'].includes(safeMethod) || data === undefined ? undefined : JSON.stringify(data);

  const response = await nangoFetch(`/proxy${safeEndpoint}${querySuffix}`, {
    method: safeMethod,
    headers: {
      'Connection-Id': row.connection_id,
      'Provider-Config-Key': integrationId,
      Retries: String(retryCount),
      ...normalizeProxyHeaders(headers),
    },
    ...(body ? { body } : {}),
  });
  return { provider: provider.key, data: response };
}

async function triggerAction({ organizationId, providerKey, actionName, input }) {
  const { provider, row } = await requireConnectedConnection(organizationId, providerKey);
  const action = String(actionName || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(action)) {
    throw integrationError('Invalid Nango action name', 400, 'INVALID_ACTION_NAME');
  }
  const integrationId = row.nango_integration_id || resolveIntegrationId(provider);
  const response = await nangoFetch('/action/trigger', {
    method: 'POST',
    headers: {
      'Connection-Id': row.connection_id,
      'Provider-Config-Key': integrationId,
    },
    body: JSON.stringify({ action_name: action, input: input ?? {} }),
  });
  return { provider: provider.key, action, data: response?.data ?? response };
}

function verifyWebhookSignature(rawBody, signature) {
  if (!config.nango?.webhookSigningKey || !signature || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto
    .createHmac('sha256', config.nango.webhookSigningKey)
    .update(rawBody)
    .digest('hex');
  const supplied = String(signature).trim().toLowerCase();
  if (supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied, 'utf8'), Buffer.from(expected, 'utf8'));
}

function providerKeyFromWebhook(payload) {
  const tagged = payload?.tags?.integration_key;
  if (tagged && getProvider(tagged)) return String(tagged).trim().toLowerCase();
  const integrationId = String(payload?.providerConfigKey || '').trim();
  for (const provider of Object.values(PROVIDERS)) {
    if (resolveIntegrationId(provider) === integrationId) return provider.key;
  }
  return null;
}

function webhookErrorMessage(payload) {
  if (typeof payload?.error === 'string') return payload.error;
  if (payload?.error?.description) return payload.error.description;
  if (payload?.error?.message) return payload.error.message;
  if (payload?.errorMessage) return payload.errorMessage;
  return 'Authorization failed';
}

// ─── Durable inbound webhook inbox (Phase 02) ───────────────────────────────
// Every inbound Nango webhook is persisted to integration_webhook_events
// (migration 112) before the connection row is touched. Redeliveries ack
// without reprocessing; failures stay replayable via
// replayInboundWebhookEvent (route wiring is a follow-up; no routes here).

const INBOX_TABLE = 'integration_webhook_events';
const INBOX_MAX_ERROR_CHARS = 500;
const INBOX_MAX_EVENT_ID_CHARS = 255;
const INBOX_UNKNOWN_PROVIDER_KEY = 'nango';

// Headers persisted to the inbox: metadata allowlist ONLY. Anything carrying
// credentials (authorization, cookies, secrets, signatures, tokens, session
// material) is dropped before insert, never logged, never returned.
const INBOX_SAFE_HEADERS = new Set([
  'content-type',
  'content-length',
  'user-agent',
  'x-request-id',
]);
const INBOX_BLOCKED_HEADER_PATTERN = /authorization|cookie|set-cookie|secret|signature|token|api-?key|session/i;

function sanitizeInboundHeaders(headers) {
  const result = {};
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return result;
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = String(rawName).trim().toLowerCase();
    if (!INBOX_SAFE_HEADERS.has(name)) continue;
    if (INBOX_BLOCKED_HEADER_PATTERN.test(name)) continue;
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') continue;
    result[name] = String(rawValue).slice(0, 500);
  }
  return result;
}

// Delivery-scoped ids only. Bare `id` is deliberately excluded: on several
// provider channels it identifies the entity (connection, object), not the
// delivery, and treating it as an event id would collapse distinct
// operations (e.g. creation vs deletion) into one dedupe key. Webhooks
// without a delivery id fall back to exact payload_hash matching.
const INBOX_EVENT_ID_FIELDS = ['eventId', 'event_id', 'deliveryId', 'webhookId', 'messageId'];

function providerEventIdFromPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  for (const field of INBOX_EVENT_ID_FIELDS) {
    const value = payload[field];
    if (typeof value === 'string' && value.trim()) {
      return value.trim().slice(0, INBOX_MAX_EVENT_ID_CHARS);
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value).slice(0, INBOX_MAX_EVENT_ID_CHARS);
    }
  }
  return null;
}

function payloadHashForInbox(rawBody) {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

function isUniqueViolation(err) {
  if (!err) return false;
  if (err.statusCode === 409 || err.status === 409) return true;
  const body = typeof err.body === 'string' ? err.body : JSON.stringify(err.body || '');
  return /23505|duplicate key|already exists/i.test(body || '');
}

const INBOX_SECRET_PATTERNS = [
  { pattern: /bearer\s+[A-Za-z0-9\-._~+/=]+/gi, replacement: 'Bearer [redacted]' },
  { pattern: /\bsk_(live|test)_[A-Za-z0-9]+\b/g, replacement: '[redacted]' },
  { pattern: /"(api[_-]?key|client[_-]?secret|refresh[_-]?token|access[_-]?token|password|secret)"\s*:\s*"[^"]*"/gi, replacement: '"$1":"[redacted]"' },
];

function redactSecretsFromText(value) {
  let text = String(value || '');
  for (const { pattern, replacement } of INBOX_SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function truncateInboxError(err) {
  const message = err instanceof Error ? err.message : String(err || 'Unknown error');
  return redactSecretsFromText(message).slice(0, INBOX_MAX_ERROR_CHARS);
}

function inboxRowFromPayload({ payload, providerKey, providerEventId, payloadHash, headers, signatureResult, status, lastError, attempts }) {
  const tags = payload && typeof payload === 'object' ? payload.tags : null;
  const organizationId = tags && typeof tags.organization_id === 'string' && tags.organization_id.trim()
    ? tags.organization_id.trim()
    : null;
  const connectionId = payload && payload.connectionId != null ? String(payload.connectionId) : null;
  return {
    organization_id: organizationId,
    provider_key: providerKey,
    provider_event_id: providerEventId,
    connection_id: connectionId,
    headers: headers || {},
    signature_result: signatureResult,
    payload: payload && typeof payload === 'object' ? payload : {},
    payload_hash: payloadHash,
    status,
    attempts,
    last_error: lastError || null,
  };
}

async function findInboxDuplicate({ providerKey, providerEventId, payloadHash }) {
  if (providerEventId) {
    const rows = await select(INBOX_TABLE, {
      filters: { provider_key: providerKey, provider_event_id: providerEventId },
      limit: 1,
    });
    return rows?.[0] || null;
  }
  const rows = await select(INBOX_TABLE, {
    filters: { provider_key: providerKey, payload_hash: payloadHash },
    limit: 1,
  });
  return rows?.[0] || null;
}

async function markInboxEvent(id, patch) {
  const rows = await update(INBOX_TABLE, patch, { id });
  return rows?.[0] || null;
}

// Durable ingest for the raw Nango webhook endpoint. Verifies HMAC, persists
// the inbox row, dedupes redeliveries (ack without reprocessing), then runs
// the same connection-update handler once. Throws integrationError with
// statusCode 401 (INVALID_NANGO_SIGNATURE) or 400 (INVALID_NANGO_PAYLOAD);
// handler failures are recorded as failed rows before the original error
// propagates so the endpoint keeps its legacy 5xx behavior.
async function ingestNangoWebhook({ rawBody, signature, headers }) {
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  if (!verifyWebhookSignature(raw, signature)) {
    throw integrationError('Invalid Nango webhook signature', 401, 'INVALID_NANGO_SIGNATURE');
  }
  const payloadHash = payloadHashForInbox(raw);
  const safeHeaders = sanitizeInboundHeaders(headers);

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch (parseErr) {
    const failedRows = await insert(INBOX_TABLE, [inboxRowFromPayload({
      payload: null,
      providerKey: INBOX_UNKNOWN_PROVIDER_KEY,
      providerEventId: null,
      payloadHash,
      headers: safeHeaders,
      signatureResult: 'verified',
      status: 'failed',
      attempts: 1,
      lastError: truncateInboxError(parseErr),
    })]);
    const parseError = integrationError('Invalid JSON payload', 400, 'INVALID_NANGO_PAYLOAD');
    parseError.inboxEventId = failedRows?.[0]?.id || null;
    throw parseError;
  }

  const providerKey = providerKeyFromWebhook(payload) || INBOX_UNKNOWN_PROVIDER_KEY;
  const providerEventId = providerEventIdFromPayload(payload);

  if (!providerEventId) {
    const hashDuplicate = await findInboxDuplicate({ providerKey, providerEventId: null, payloadHash });
    if (hashDuplicate) {
      return { outcome: 'duplicate', eventId: hashDuplicate.id, handlerResult: null };
    }
  }

  let inboxRow;
  try {
    const inserted = await insert(INBOX_TABLE, [inboxRowFromPayload({
      payload,
      providerKey,
      providerEventId,
      payloadHash,
      headers: safeHeaders,
      signatureResult: 'verified',
      status: 'received',
      attempts: 0,
    })]);
    inboxRow = inserted?.[0] || null;
  } catch (insertErr) {
    if (!providerEventId || !isUniqueViolation(insertErr)) throw insertErr;
    const existing = await findInboxDuplicate({ providerKey, providerEventId, payloadHash });
    return { outcome: 'duplicate', eventId: existing?.id || null, handlerResult: null };
  }
  if (!inboxRow) {
    throw integrationError('Failed to persist inbound webhook event', 500, 'INBOX_PERSIST_FAILED');
  }

  await markInboxEvent(inboxRow.id, { status: 'processing', attempts: 1, dead_at: null, updated_at: new Date().toISOString() });

  let handlerResult;
  try {
    handlerResult = await handleAuthWebhook(payload);
  } catch (handlerErr) {
    await markInboxEvent(inboxRow.id, {
      status: 'failed',
      last_error: truncateInboxError(handlerErr),
      updated_at: new Date().toISOString(),
    });
    throw handlerErr;
  }

  await markInboxEvent(inboxRow.id, {
    status: 'succeeded',
    last_error: null,
    updated_at: new Date().toISOString(),
  });
  return { outcome: 'processed', eventId: inboxRow.id, handlerResult };
}

// On-demand replay of a persisted inbox row. Tenant-isolated: the row is
// loaded scoped to organizationId, so replaying another org's event 404s.
// Rows already succeeded are refused unless force=true (re-running a
// succeeded connection update is normally a no-op but must be explicit).
// A payload whose routing tags point at a different org than the caller also
// 404s rather than mutating another tenant. No route wiring here.
async function replayInboundWebhookEvent({ organizationId, eventId, force = false }) {
  const orgId = String(organizationId || '').trim();
  const rowId = String(eventId || '').trim();
  if (!orgId || !rowId) {
    throw integrationError('organizationId and eventId are required', 400, 'INVALID_REPLAY_REQUEST');
  }
  const rows = await select(INBOX_TABLE, {
    filters: { id: rowId, organization_id: orgId },
    limit: 1,
  });
  const row = rows?.[0] || null;
  if (!row) {
    throw integrationError('Inbound webhook event not found', 404, 'INBOX_EVENT_NOT_FOUND');
  }
  if (row.status === 'succeeded' && !force) {
    throw integrationError(
      'Event already processed; pass force=true to replay a succeeded event',
      409,
      'INBOX_EVENT_ALREADY_SUCCEEDED',
    );
  }
  const taggedOrg = row.payload?.tags?.organization_id ? String(row.payload.tags.organization_id) : null;
  if (taggedOrg && taggedOrg !== orgId) {
    throw integrationError('Inbound webhook event not found', 404, 'INBOX_EVENT_NOT_FOUND');
  }

  const attempts = (Number.isInteger(row.attempts) ? row.attempts : 0) + 1;
  await markInboxEvent(row.id, {
    status: 'processing',
    attempts,
    dead_at: null,
    updated_at: new Date().toISOString(),
  });

  let handlerResult;
  try {
    handlerResult = await handleAuthWebhook(row.payload);
  } catch (handlerErr) {
    await markInboxEvent(row.id, {
      status: 'failed',
      attempts,
      last_error: truncateInboxError(handlerErr),
      updated_at: new Date().toISOString(),
    });
    throw handlerErr;
  }

  await markInboxEvent(row.id, {
    status: 'succeeded',
    attempts,
    last_error: null,
    updated_at: new Date().toISOString(),
  });
  return { eventId: row.id, status: 'succeeded', attempts, handlerResult };
}

async function handleAuthWebhook(payload) {
  if (payload?.type !== 'auth') return { ignored: true };
  const supportedOperations = new Set(['creation', 'override', 'refresh', 'deletion']);
  if (!supportedOperations.has(payload?.operation)) return { ignored: true };

  const organizationId = payload?.tags?.organization_id;
  const providerKey = providerKeyFromWebhook(payload);
  if (!organizationId || !providerKey) {
    logger.warn('Nango auth webhook missing Dilivygo routing tags', {
      operation: payload?.operation || null,
      hasOrganizationId: Boolean(organizationId),
      providerConfigKey: payload?.providerConfigKey || null,
    });
    return { ignored: true };
  }

  const existing = await findConnection(String(organizationId), providerKey);
  if (!existing) {
    logger.warn('Nango auth webhook has no matching Dilivygo connection', {
      organizationId,
      providerKey,
      operation: payload.operation,
    });
    return { ignored: true };
  }

  const now = new Date().toISOString();
  if (payload.operation === 'deletion') {
    await update('integration_connections', {
      connection_id: null,
      status: 'disconnected',
      disconnected_at: now,
      updated_at: now,
    }, { id: existing.id });
    return { updated: true, status: 'disconnected' };
  }

  if (payload.success === false) {
    await update('integration_connections', {
      status: 'error',
      metadata: {
        lastAuthOperation: payload.operation,
        lastAuthError: webhookErrorMessage(payload),
        lastAuthErrorAt: now,
      },
      updated_at: now,
    }, { id: existing.id });
    return { updated: true, status: 'error' };
  }

  if (payload.operation === 'refresh') {
    await update('integration_connections', {
      status: 'connected',
      metadata: {},
      updated_at: now,
    }, { id: existing.id });
    return { updated: true, status: 'connected' };
  }

  if (!payload.connectionId) {
    logger.warn('Nango auth webhook missing connectionId', {
      organizationId,
      providerKey,
      operation: payload.operation,
    });
    return { ignored: true };
  }

  await update('integration_connections', {
    connection_id: String(payload.connectionId),
    nango_integration_id: String(payload.providerConfigKey || existing.nango_integration_id),
    status: 'connected',
    auth_mode: payload.authMode || null,
    provider: payload.provider || null,
    environment: payload.environment || null,
    metadata: {},
    connected_at: existing.connected_at || now,
    disconnected_at: null,
    updated_at: now,
  }, { id: existing.id });

  return { updated: true, status: 'connected' };
}

module.exports = {
  PROVIDERS,
  NATIVE_PROVIDERS,
  getProvider,
  resolveIntegrationId,
  isProviderAvailable,
  listConnections,
  createConnectSession,
  createReconnectSession,
  disconnect,
  proxyRequest,
  triggerAction,
  verifyWebhookSignature,
  handleAuthWebhook,
  sanitizeInboundHeaders,
  ingestNangoWebhook,
  replayInboundWebhookEvent,
};