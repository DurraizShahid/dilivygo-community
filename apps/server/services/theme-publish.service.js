'use strict';

const { supabaseFetch, select } = require('../lib/supabase');
const platformSettings = require('../models/platform-settings.model');
const logger = require('../lib/logger');

function parseRequiredThemeVersion(req) {
  const raw = req.headers && req.headers['if-match'];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { error: { status: 428, message: 'If-Match theme version is required' } };
  }
  const normalized = String(raw).trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
  if (!/^\d+$/.test(normalized)) {
    return { error: { status: 400, message: 'If-Match must be a non-negative integer theme version' } };
  }
  const expectedVersion = Number(normalized);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    return { error: { status: 400, message: 'If-Match must be a non-negative integer theme version' } };
  }
  return { expectedVersion };
}

async function getThemeVersion(organizationId) {
  const raw = await platformSettings.get('theme_version', { organizationId });
  return Math.max(0, parseInt(String(raw || '0'), 10) || 0);
}

function isVersionConflict(err) {
  return /THEME_VERSION_CONFLICT/i.test(`${err?.message || ''} ${err?.body || ''}`);
}

async function validateThemeOrThrow(theme) {
  const { validateManualTheme } = require('../../../packages/theme-engine/src/accessibility.js');
  return validateManualTheme(theme.light || {}, theme.dark || {});
}

async function publishOrganizationThemeAtomic({
  organizationId,
  theme,
  expectedVersion,
  source = 'manual',
  logoHash = null,
  strategy = null,
  generatorVersion = null,
  analyzerVersion = null,
  createdBy = null,
  restoredFrom = null,
}) {
  try {
    const rows = await supabaseFetch('/rest/v1/rpc/publish_organization_theme', {
      method: 'POST',
      body: JSON.stringify({
        p_organization_id: organizationId,
        p_theme_json: JSON.stringify(theme),
        p_expected_version: expectedVersion,
        p_source: source,
        p_logo_hash: logoHash,
        p_strategy: strategy,
        p_generator_version: generatorVersion,
        p_analyzer_version: analyzerVersion,
        p_created_by: createdBy,
        p_restored_from: restoredFrom,
      }),
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row || !Number.isInteger(row.new_version)) {
      throw new Error('publish_organization_theme returned an invalid result');
    }
    return { newVersion: row.new_version, historyId: row.history_id || null };
  } catch (err) {
    if (isVersionConflict(err)) {
      const conflict = new Error('Theme version conflict — reload and try again');
      conflict.code = 'THEME_VERSION_CONFLICT';
      conflict.currentVersion = await getThemeVersion(organizationId).catch(() => null);
      conflict.expectedVersion = expectedVersion;
      throw conflict;
    }
    logger.error('atomic theme publish failed closed', {
      organizationId,
      error: err?.message || String(err),
      body: err?.body || null,
    });
    const blocked = new Error('Atomic theme publish unavailable — no changes were saved');
    blocked.code = 'THEME_PUBLISH_UNAVAILABLE';
    throw blocked;
  }
}

async function broadcastThemeUpdated(organizationId) {
  try {
    const wsServer = require('../websocket/ws-server');
    const { orgCustomerWsRef, orgRiderWsRef, orgStaffWsRef } = require('../lib/platform-constants');
    const workspaces = await select('workspaces', { filters: { organization_id: organizationId }, limit: 500 });
    const payload = { type: 'theme:updated', organizationId, updatedAt: new Date().toISOString() };
    wsServer.broadcast(orgStaffWsRef(organizationId), payload);
    wsServer.broadcast(orgCustomerWsRef(organizationId), payload);
    wsServer.broadcast(orgRiderWsRef(organizationId), payload);
    for (const ws of workspaces || []) {
      const ref = ws?.project_ref != null ? String(ws.project_ref).trim() : '';
      if (ref) wsServer.broadcast(ref, payload);
    }
  } catch (err) {
    logger.warn('theme websocket broadcast failed', { organizationId, error: err?.message || String(err) });
  }
  try {
    const cache = require('../lib/cache');
    cache.invalidate('public:theme');
  } catch (_) {}
}

module.exports = {
  parseRequiredThemeVersion,
  getThemeVersion,
  validateThemeOrThrow,
  publishOrganizationThemeAtomic,
  broadcastThemeUpdated,
};
