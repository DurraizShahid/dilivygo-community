'use strict';

const DEFAULT_BASE_URL = 'https://api.nango.dev';
const DEFAULT_TIMEOUT_MS = 15_000;

function getConfig() {
  const secretKey = String(process.env.NANGO_SECRET_KEY || '').trim();
  const baseUrl = String(process.env.NANGO_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, '');
  const timeoutMs = Math.max(
    1_000,
    parseInt(process.env.NANGO_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10) || DEFAULT_TIMEOUT_MS,
  );
  return {
    secretKey,
    baseUrl,
    timeoutMs,
    enabled: Boolean(secretKey),
  };
}

class NangoApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'NangoApiError';
    this.status = options.status || 502;
    this.code = options.code || 'NANGO_API_ERROR';
    this.details = options.details || null;
  }
}

async function request(path, options = {}) {
  const config = getConfig();
  if (!config.enabled) {
    throw new NangoApiError('Nango is not configured on this deployment', {
      status: 503,
      code: 'NANGO_NOT_CONFIGURED',
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  timeout.unref?.();

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const upstream = body?.error || body || {};
      const message =
        upstream.message ||
        (typeof upstream === 'string' ? upstream : null) ||
        `Nango request failed with status ${response.status}`;
      throw new NangoApiError(message, {
        status: response.status,
        code: upstream.code || 'NANGO_UPSTREAM_ERROR',
        details: upstream.errors || null,
      });
    }

    return body;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new NangoApiError('Nango request timed out', {
        status: 504,
        code: 'NANGO_TIMEOUT',
      });
    }
    if (err instanceof NangoApiError) throw err;
    throw new NangoApiError(err?.message || 'Unable to reach Nango', {
      status: 502,
      code: 'NANGO_UNAVAILABLE',
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildTags({ organizationId, userId, email, displayName }) {
  const tags = {
    organization_id: String(organizationId),
    end_user_id: String(userId),
  };
  if (email) tags.end_user_email = String(email);
  if (displayName) tags.end_user_display_name = String(displayName);
  return tags;
}

async function createConnectSession({ integrationId, organizationId, userId, email, displayName }) {
  const response = await request('/connect/sessions', {
    method: 'POST',
    body: JSON.stringify({
      tags: buildTags({ organizationId, userId, email, displayName }),
      allowed_integrations: [integrationId],
    }),
  });
  return response?.data || response;
}

async function createReconnectSession({ integrationId, connectionId, organizationId, userId, email, displayName }) {
  const response = await request('/connect/sessions/reconnect', {
    method: 'POST',
    body: JSON.stringify({
      integration_id: integrationId,
      connection_id: connectionId,
      tags: buildTags({ organizationId, userId, email, displayName }),
    }),
  });
  return response?.data || response;
}

async function listConnections({ organizationId, limit = 100, maxPages = 10 }) {
  const connections = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams();
    params.set('tags[organization_id]', String(organizationId));
    params.set('limit', String(limit));
    params.set('page', String(page));
    const body = await request(`/connections?${params.toString()}`);
    const batch = Array.isArray(body?.connections) ? body.connections : [];
    connections.push(...batch);
    if (batch.length < limit) break;
  }
  return connections;
}

async function getOrgConnection({ organizationId, integrationId, connectionId }) {
  const organizationKey = String(organizationId);
  const connections = await listConnections({ organizationId });
  return connections.find(
    (connection) =>
      String(connection.connection_id) === String(connectionId) &&
      String(connection.provider_config_key) === String(integrationId) &&
      String(connection.tags?.organization_id || '') === organizationKey,
  ) || null;
}

async function deleteConnection({ organizationId, integrationId, connectionId }) {
  const ownedConnection = await getOrgConnection({ organizationId, integrationId, connectionId });
  if (!ownedConnection) {
    throw new NangoApiError('Connection does not belong to this organization', {
      status: 404,
      code: 'NANGO_CONNECTION_NOT_FOUND',
    });
  }

  const params = new URLSearchParams({ provider_config_key: integrationId });
  return request(`/connections/${encodeURIComponent(connectionId)}?${params.toString()}`, {
    method: 'DELETE',
  });
}

module.exports = {
  NangoApiError,
  getConfig,
  createConnectSession,
  createReconnectSession,
  listConnections,
  getOrgConnection,
  deleteConnection,
};
