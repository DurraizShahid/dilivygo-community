'use strict';

/**
 * Org-scoped CRUD over `integration_connections` (migration 103).
 *
 * Phase 01 hardening: services previously used `lib/supabase` directly. This
 * model centralizes that access without changing behavior — the services are
 * NOT migrated to it in this phase (separate wiring step).
 *
 * Token boundary: the table deliberately holds only the opaque Nango
 * `connection_id` + `nango_integration_id` plus non-sensitive metadata.
 * - Reads select an explicit allowlist (`SAFE_COLUMNS`) — no token columns
 *   exist, and none are ever added here.
 * - Writes pass through a camelCase→column allowlist (`WRITABLE_COLUMNS`);
 *   anything else in the input (access/refresh tokens, api keys, secrets…)
 *   is silently dropped and never persisted.
 *
 * Style follows `models/integration-request.model.js` (BaseModel subclass,
 * UUID ids, ISO timestamps, singleton export) but uses the real BaseModel
 * API (`findOne`/`findMany`/`create`/`updateById`).
 */

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');

const SAFE_COLUMNS = [
  'id',
  'organization_id',
  'provider_key',
  'nango_integration_id',
  'connection_id',
  'status',
  'auth_mode',
  'provider',
  'environment',
  'metadata',
  'connected_at',
  'disconnected_at',
  'created_at',
  'updated_at',
].join(',');

/** Client (camelCase) field → column. Everything else is dropped, never stored. */
const WRITABLE_COLUMNS = Object.freeze({
  connectionId: 'connection_id',
  nangoIntegrationId: 'nango_integration_id',
  status: 'status',
  authMode: 'auth_mode',
  provider: 'provider',
  environment: 'environment',
  metadata: 'metadata',
  connectedAt: 'connected_at',
  disconnectedAt: 'disconnected_at',
});

/** Mirrors the `integration_connections_status_check` DB constraint. */
const CONNECTION_STATUSES = Object.freeze(['pending', 'connected', 'error', 'disconnected']);

function connectionFieldError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = 'INVALID_CONNECTION_FIELDS';
  return err;
}

function pickConnectionFields(fields) {
  const source = fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : {};
  const picked = {};
  for (const [from, to] of Object.entries(WRITABLE_COLUMNS)) {
    if (source[from] !== undefined) picked[to] = source[from];
  }
  if (picked.status !== undefined && !CONNECTION_STATUSES.includes(picked.status)) {
    throw connectionFieldError(`Invalid connection status. Allowed: ${CONNECTION_STATUSES.join(', ')}`);
  }
  return picked;
}

class IntegrationConnectionModel extends BaseModel {
  constructor() {
    super('integration_connections');
  }

  normalizeProviderKey(providerKey) {
    return String(providerKey || '').trim().toLowerCase();
  }

  /**
   * Every row for one organization (tenant isolation boundary). Never
   * cross-organization: callers must pass the authenticated org id.
   */
  async listByOrganization(organizationId) {
    if (!organizationId) return [];
    return this.findMany(
      { organization_id: organizationId },
      { select: SAFE_COLUMNS, order: 'created_at.asc', limit: 250 },
    );
  }

  /**
   * Single org+provider row, or `null` — including the cross-org case (a row
   * owned by another org never matches because the org id is in the filter).
   */
  async findByOrgProvider(organizationId, providerKey) {
    const key = this.normalizeProviderKey(providerKey);
    if (!organizationId || !key) return null;
    return this.findOne(
      { organization_id: organizationId, provider_key: key },
      SAFE_COLUMNS,
    );
  }

  /**
   * Insert-or-update keyed by the `(organization_id, provider_key)` unique
   * constraint. `fields` uses camelCase names; unknown/token-like keys are
   * dropped (see `WRITABLE_COLUMNS`).
   */
  async upsertConnectionId(organizationId, providerKey, fields = {}) {
    const key = this.normalizeProviderKey(providerKey);
    if (!organizationId || !key) {
      throw connectionFieldError('organizationId and providerKey are required');
    }
    const picked = pickConnectionFields(fields);
    const now = new Date().toISOString();
    const existing = await this.findByOrgProvider(organizationId, key);
    if (existing) {
      return this.updateById(existing.id, { ...picked, updated_at: now });
    }
    return this.create({
      id: uuidv4(),
      organization_id: organizationId,
      provider_key: key,
      ...picked,
      nango_integration_id: picked.nango_integration_id || key,
      status: picked.status || 'pending',
      created_at: now,
      updated_at: now,
    });
  }

  /**
   * DB half of disconnect (mirrors the service's update without the upstream
   * Nango delete, which stays in the service). Returns `null` when there is
   * nothing to disconnect — same "already disconnected" semantics.
   */
  async markDisconnected(organizationId, providerKey) {
    const existing = await this.findByOrgProvider(organizationId, providerKey);
    if (!existing) return null;
    const now = new Date().toISOString();
    return this.updateById(existing.id, {
      connection_id: null,
      status: 'disconnected',
      disconnected_at: now,
      updated_at: now,
    });
  }
}

module.exports = new IntegrationConnectionModel();
