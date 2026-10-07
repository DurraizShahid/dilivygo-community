'use strict';

const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const config = require('../config');
const logger = require('../lib/logger');
const { select, insert, update, remove } = require('../lib/supabase');

const PROVIDERS = Object.freeze({
  n8n: { key: 'n8n', displayName: 'n8n' },
  zapier: { key: 'zapier', displayName: 'Zapier' },
  make: { key: 'make', displayName: 'Make' },
});
const EVENT_TYPES = Object.freeze([
  'order.created',
  'order.status_changed',
  'order.refunded',
]);
const MAX_ATTEMPTS = 6;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];

function encryptionKey() {
  const source = process.env.INTEGRATION_WEBHOOK_ENCRYPTION_KEY || config.session.secret;
  return crypto.createHash('sha256').update(String(source)).digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptSecret(value) {
  const [version, ivRaw, tagRaw, ciphertextRaw] = String(value || '').split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) throw new Error('Invalid encrypted webhook secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function isPrivateIp(address) {
  if (!address) return true;
  if (net.isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  return true;
}

async function assertPublicWebhookUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch {
    const err = new Error('Webhook URL must be a valid absolute URL');
    err.statusCode = 400;
    throw err;
  }
  if (url.protocol !== 'https:' && !(config.env !== 'production' && url.protocol === 'http:')) {
    const err = new Error('Webhook URL must use HTTPS');
    err.statusCode = 400;
    throw err;
  }
  if (url.username || url.password) {
    const err = new Error('Webhook URL must not contain embedded credentials');
    err.statusCode = 400;
    throw err;
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    const err = new Error('Webhook URL cannot target a local/private host');
    err.statusCode = 400;
    throw err;
  }
  const records = net.isIP(hostname)
    ? [{ address: hostname }]
    : await dns.lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    const err = new Error('Webhook URL must resolve only to public IP addresses');
    err.statusCode = 400;
    throw err;
  }
  return url.toString();
}

function normalizeEvents(eventTypes) {
  const requested = Array.isArray(eventTypes) && eventTypes.length ? eventTypes : EVENT_TYPES;
  const values = [...new Set(requested.map((value) => String(value).trim()))];
  if (!values.length || values.some((value) => !EVENT_TYPES.includes(value))) {
    const err = new Error(`Unsupported webhook event type. Allowed: ${EVENT_TYPES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  return values;
}

async function listEndpoints(organizationId) {
  const rows = await select('integration_webhook_endpoints', {
    select: 'id,organization_id,provider_key,name,url,event_types,active,created_at,updated_at',
    filters: { organization_id: organizationId },
    order: 'created_at.asc',
    limit: 20,
  });
  return rows || [];
}

async function configureEndpoint({ organizationId, providerKey, url, eventTypes }) {
  const provider = PROVIDERS[String(providerKey || '').trim().toLowerCase()];
  if (!provider) {
    const err = new Error('Unsupported automation provider');
    err.statusCode = 404;
    throw err;
  }
  const safeUrl = await assertPublicWebhookUrl(url);
  const events = normalizeEvents(eventTypes);
  const now = new Date().toISOString();
  const existing = (await select('integration_webhook_endpoints', {
    filters: { organization_id: organizationId, provider_key: provider.key },
    limit: 1,
  }))?.[0];

  let endpoint;
  let signingSecret = null;
  if (existing) {
    const rows = await update('integration_webhook_endpoints', {
      name: provider.displayName,
      url: safeUrl,
      event_types: events,
      active: true,
      updated_at: now,
    }, { id: existing.id });
    endpoint = rows?.[0] || { ...existing, url: safeUrl, event_types: events, active: true };
  } else {
    signingSecret = `dgv_whsec_${crypto.randomBytes(32).toString('base64url')}`;
    const encrypted = encryptSecret(signingSecret);
    const rows = await insert('integration_webhook_endpoints', [{
      organization_id: organizationId,
      provider_key: provider.key,
      name: provider.displayName,
      url: safeUrl,
      event_types: events,
      signing_secret_encrypted: encrypted,
      active: true,
      created_at: now,
      updated_at: now,
    }]);
    endpoint = rows?.[0];
    if (!endpoint) {
      const err = new Error('Could not persist the webhook endpoint');
      err.statusCode = 500;
      throw err;
    }
  }

  return {
    endpoint: {
      id: endpoint.id,
      providerKey: provider.key,
      name: provider.displayName,
      url: safeUrl,
      eventTypes: events,
      active: true,
    },
    signingSecret,
  };
}

async function disconnectEndpoint({ organizationId, providerKey }) {
  const provider = PROVIDERS[String(providerKey || '').trim().toLowerCase()];
  if (!provider) {
    const err = new Error('Unsupported automation provider');
    err.statusCode = 404;
    throw err;
  }
  await remove('integration_webhook_endpoints', {
    organization_id: organizationId,
    provider_key: provider.key,
  });
  return { success: true };
}

async function getProviderStatuses(organizationId) {
  const endpoints = await listEndpoints(organizationId);
  const byProvider = new Map(endpoints.map((row) => [row.provider_key, row]));
  return Object.values(PROVIDERS).map((provider) => {
    const row = byProvider.get(provider.key);
    return {
      key: provider.key,
      displayName: provider.displayName,
      type: 'webhook',
      priority: 'core',
      capabilities: ['automation', 'webhooks'],
      status: row?.active ? 'connected' : 'not_connected',
      available: true,
      endpointUrl: row?.url || null,
      eventTypes: row?.event_types || EVENT_TYPES,
    };
  });
}

async function sendTestEvent({ organizationId, providerKey }) {
  const provider = PROVIDERS[String(providerKey || '').trim().toLowerCase()];
  if (!provider) {
    const err = new Error('Unsupported automation provider');
    err.statusCode = 404;
    throw err;
  }

  const endpoint = (await select('integration_webhook_endpoints', {
    filters: { organization_id: organizationId, provider_key: provider.key, active: true },
    limit: 1,
  }))?.[0];
  if (!endpoint) {
    const err = new Error(`Connect ${provider.displayName} before sending a test event`);
    err.statusCode = 409;
    throw err;
  }

  const safeUrl = await assertPublicWebhookUrl(endpoint.url);
  const now = new Date().toISOString();
  const eventId = `integration.test:${crypto.randomUUID()}`;
  const payload = {
    id: eventId,
    type: 'integration.test',
    apiVersion: '2026-09-05',
    createdAt: now,
    organizationId,
    projectRef: null,
    data: {
      provider: provider.key,
      message: 'Dilivygo webhook test succeeded.',
    },
  };
  const rawBody = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', decryptSecret(endpoint.signing_secret_encrypted))
    .update(rawBody)
    .digest('hex');

  let response;
  try {
    response = await fetch(safeUrl, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Dilivygo-Integrations/1.0',
        'X-Dilivygo-Event': 'integration.test',
        'X-Dilivygo-Event-Id': eventId,
        'X-Dilivygo-Signature-Sha256': signature,
      },
      body: rawBody,
    });
  } catch (cause) {
    const err = new Error(`Could not reach ${provider.displayName} webhook: ${cause.message || 'network error'}`);
    err.statusCode = 502;
    throw err;
  }

  if (!response.ok) {
    const err = new Error(`${provider.displayName} webhook returned HTTP ${response.status}`);
    err.statusCode = 502;
    throw err;
  }

  return { success: true, providerKey: provider.key, eventId, httpStatus: response.status };
}

async function organizationIdForProjectRef(projectRef) {
  if (!projectRef) return null;
  const row = (await select('workspaces', {
    select: 'organization_id',
    filters: { project_ref: projectRef },
    limit: 1,
  }))?.[0];
  return row?.organization_id || null;
}

async function enqueueEvent({ eventId, eventType, projectRef, payload }) {
  if (!eventId || !EVENT_TYPES.includes(eventType) || !projectRef) return { queued: 0 };
  const organizationId = await organizationIdForProjectRef(projectRef);
  if (!organizationId) return { queued: 0 };
  const endpoints = await listEndpoints(organizationId);
  const matching = endpoints.filter((endpoint) => endpoint.active && (endpoint.event_types || []).includes(eventType));
  if (!matching.length) return { queued: 0 };

  const now = new Date().toISOString();
  const envelope = {
    id: eventId,
    type: eventType,
    apiVersion: '2026-09-05',
    createdAt: now,
    organizationId,
    projectRef,
    data: payload,
  };
  const rows = matching.map((endpoint) => ({
    endpoint_id: endpoint.id,
    event_id: eventId,
    event_type: eventType,
    payload: envelope,
    status: 'pending',
    attempts: 0,
    next_attempt_at: now,
    created_at: now,
    updated_at: now,
  }));
  try {
    await insert('integration_webhook_deliveries', rows);
    return { queued: rows.length };
  } catch (err) {
    // Domain writes must never fail because an integration outbox insert fails.
    logger.error('Integration webhook enqueue failed', { eventId, eventType, error: err.message });
    return { queued: 0, error: true };
  }
}

function nextAttemptIso(attempts) {
  const delay = RETRY_DELAYS_MS[Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_MS.length - 1)];
  return new Date(Date.now() + delay).toISOString();
}

async function deliverOne(delivery) {
  const endpoint = (await select('integration_webhook_endpoints', {
    filters: { id: delivery.endpoint_id, active: true },
    limit: 1,
  }))?.[0];
  if (!endpoint) {
    await update('integration_webhook_deliveries', {
      status: 'dead',
      last_error: 'Endpoint removed or disabled',
      updated_at: new Date().toISOString(),
    }, { id: delivery.id });
    return { dead: true };
  }

  const safeUrl = await assertPublicWebhookUrl(endpoint.url);
  const rawBody = JSON.stringify(delivery.payload);
  const signature = crypto
    .createHmac('sha256', decryptSecret(endpoint.signing_secret_encrypted))
    .update(rawBody)
    .digest('hex');
  const attempt = Number(delivery.attempts || 0) + 1;
  let response;
  let errorMessage = null;
  try {
    response = await fetch(safeUrl, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Dilivygo-Integrations/1.0',
        'X-Dilivygo-Event': delivery.event_type,
        'X-Dilivygo-Event-Id': delivery.event_id,
        'X-Dilivygo-Signature-Sha256': signature,
      },
      body: rawBody,
    });
    if (!response.ok) errorMessage = `HTTP ${response.status}`;
  } catch (err) {
    errorMessage = err.message || 'Network error';
  }

  const now = new Date().toISOString();
  if (response?.ok) {
    await update('integration_webhook_deliveries', {
      status: 'delivered',
      attempts: attempt,
      last_http_status: response.status,
      last_error: null,
      delivered_at: now,
      updated_at: now,
    }, { id: delivery.id });
    return { delivered: true };
  }

  const dead = attempt >= MAX_ATTEMPTS;
  await update('integration_webhook_deliveries', {
    status: dead ? 'dead' : 'pending',
    attempts: attempt,
    next_attempt_at: dead ? delivery.next_attempt_at : nextAttemptIso(attempt),
    last_http_status: response?.status || null,
    last_error: String(errorMessage || 'Delivery failed').slice(0, 500),
    updated_at: now,
  }, { id: delivery.id });
  return { delivered: false, dead };
}

async function deliverDue({ limit = 50 } = {}) {
  const now = new Date().toISOString();
  const rows = await select('integration_webhook_deliveries', {
    filters: { status: 'pending' },
    rawFilters: [`next_attempt_at=lte.${now}`],
    order: 'next_attempt_at.asc',
    limit,
  });
  let delivered = 0;
  let failed = 0;
  for (const delivery of rows || []) {
    try {
      const result = await deliverOne(delivery);
      if (result.delivered) delivered += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      logger.error('Integration webhook delivery crashed', { deliveryId: delivery.id, error: err.message });
    }
  }
  return { processed: (rows || []).length, delivered, failed };
}

module.exports = {
  PROVIDERS,
  EVENT_TYPES,
  configureEndpoint,
  disconnectEndpoint,
  getProviderStatuses,
  sendTestEvent,
  enqueueEvent,
  deliverDue,
  _test: { encryptSecret, decryptSecret, assertPublicWebhookUrl, isPrivateIp },
};
