'use strict';

/**
 * Developer API key lifecycle (Phase 14 — foundations only, NOT mounted).
 *
 * Model (migration `122_developer_platform_keys.sql`):
 *   developer_apps     (id, organization_id, name, trust_level, created_by, revoked_at)
 *   developer_api_keys (id, app_id, key_prefix, key_hash, scopes, expires_at,
 *                       last_used_at, revoked_at, rotation_of)
 *
 * Security rules (global rules §6: server-side secrets only):
 * - Plaintext keys exist ONLY as the return value of `mintDeveloperKey` /
 *   `rotateDeveloperKey`, exactly ONCE. They are NEVER persisted, NEVER
 *   logged, and NEVER returned by `verifyDeveloperKey` or any read path.
 * - Storage is SHA-256 hex (`key_hash`) with a UNIQUE constraint; lookup is
 *   by hash equality plus a timing-safe re-compare of the matched row
 *   (defense-in-depth against hash-collision probing via error oracles).
 * - `key_prefix` (`dilivygo_` + a few chars) is a NON-SECRET support
 *   identifier for "which key is failing?" triage. It is never sufficient
 *   for authentication.
 *
 * Rotation (grace overlap):
 *   1. `rotateDeveloperKey` mints a NEW key with `rotation_of = <old id>`.
 *   2. The OLD key stays valid during the caller-chosen grace window so
 *      in-flight deploys keep working (overlap).
 *   3. After the grace window the caller invokes `revokeDeveloperKey` on the
 *      old id. Revocation is immediate and permanent.
 *
 * Per-key rate limits:
 *   Mount `express-rate-limit` with `keyGenerator: developerKeyRateKey` (plus
 *   the repo's Redis store, mirroring `middleware/rate-limit.middleware.js`)
 *   so one key cannot starve an org's other keys. Suggested budget is
 *   DEVELOPER_KEY_RATE_LIMIT (120 req/min/key); the SaaS dashboard may lower
 *   it per trust level later. Rate-limit keys use a one-way digest of the key
 *   id — raw key material never appears in Redis keys or logs.
 *
 * Tenant isolation: every operation resolves the owning app and compares
 * `app.organization_id` to the caller-supplied organization id. Cross-org
 * use is denied with DEVELOPER_ORG_MISMATCH (403), and unknown/revoked/
 * expired keys fail closed with 401 codes that reveal nothing about which
 * other orgs exist.
 */

const crypto = require('crypto');
const supabase = require('../lib/supabase');
const { assertIssuableScopes } = require('../lib/developer-scopes');

const KEY_PREFIX = 'dilivygo_';
const RANDOM_BYTES = 32;
const STORED_PREFIX_CHARS = 16;

/**
 * Suggested per-key rate-limit budget for the future mount step.
 * (Shape-only here: the limiter itself is mounted by the main session.)
 */
const DEVELOPER_KEY_RATE_LIMIT = Object.freeze({
  windowMs: 60 * 1000,
  max: 120,
  storePrefix: 'rl:developer_key',
});

/**
 * Rate-limit key for express-rate-limit: one-way digest of org + key id.
 * Falls back to IP when no verified key is attached (unauthenticated abuse).
 */
function developerKeyRateKey(req) {
  const keyId = req?.developerKey?.keyId;
  const org = req?.developerKey?.organizationId || req?.organizationId || req?.saasOrganizationId || '';
  if (keyId) {
    const digest = crypto
      .createHash('sha256')
      .update(`${org}:${keyId}`)
      .digest('hex')
      .slice(0, 32);
    return `devkey:${digest}`;
  }
  const ip = typeof req?.ip === 'string' ? req.ip : 'unknown';
  return `devkey:ip:${ip}`;
}

function developerKeyError(message, statusCode, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

/** SHA-256 hex digest — the ONLY form of a key that ever touches storage. */
function hashKey(plaintext) {
  return crypto.createHash('sha256').update(String(plaintext), 'utf8').digest('hex');
}

/** Timing-safe equality for hex digests (defense-in-depth after hash lookup). */
function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function generatePlaintextKey() {
  return `${KEY_PREFIX}${crypto.randomBytes(RANDOM_BYTES).toString('base64url')}`;
}

function firstRow(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/** Strip every secret / internal field before returning a key row to callers. */
function sanitizeKeyRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    appId: row.app_id,
    keyPrefix: row.key_prefix,
    scopes: Array.isArray(row.scopes) ? [...row.scopes] : [],
    expiresAt: row.expires_at || null,
    lastUsedAt: row.last_used_at || null,
    revokedAt: row.revoked_at || null,
    rotationOf: row.rotation_of || null,
    createdAt: row.created_at || null,
  };
}

function sanitizeAppRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    trustLevel: row.trust_level,
    revokedAt: row.revoked_at || null,
    createdAt: row.created_at || null,
  };
}

function isExpired(row, now = Date.now()) {
  if (!row?.expires_at) return false;
  return new Date(row.expires_at).getTime() <= now;
}

async function findAppById(appId) {
  const rows = await supabase.select('developer_apps', { filters: { id: appId }, limit: 1 });
  return firstRow(rows);
}

function assertAppUsable(app) {
  if (!app) {
    throw developerKeyError('Developer app not found', 404, 'DEVELOPER_APP_NOT_FOUND');
  }
  if (app.revoked_at) {
    throw developerKeyError('Developer app is revoked', 401, 'DEVELOPER_APP_REVOKED');
  }
}

function assertSameOrg(app, organizationId) {
  if (String(app.organization_id) !== String(organizationId)) {
    throw developerKeyError('Developer credential is not valid for this organization', 403, 'DEVELOPER_ORG_MISMATCH');
  }
}

/**
 * Mint a new API key for an app. Returns the plaintext EXACTLY ONCE —
 * callers must display it once and never persist it outside the vault.
 */
async function mintDeveloperKey({ organizationId, appId, scopes, expiresAt = null }) {
  if (!organizationId) {
    throw developerKeyError('organizationId is required', 400, 'DEVELOPER_ORG_REQUIRED');
  }
  if (!appId) {
    throw developerKeyError('appId is required', 400, 'DEVELOPER_APP_REQUIRED');
  }
  const app = await findAppById(appId);
  assertAppUsable(app);
  assertSameOrg(app, organizationId);

  const granted = assertIssuableScopes(scopes, app.trust_level);

  const plaintext = generatePlaintextKey();
  const keyHash = hashKey(plaintext);
  const keyPrefix = plaintext.slice(0, STORED_PREFIX_CHARS);

  const inserted = await supabase.insert('developer_api_keys', {
    app_id: appId,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    scopes: [...granted],
    expires_at: expiresAt,
    rotation_of: null,
  });
  const row = firstRow(inserted) || { id: null, app_id: appId, key_prefix: keyPrefix, scopes: [...granted], expires_at: expiresAt };

  // NOTE: `plaintext` is returned here and nowhere else. Never log it.
  return {
    id: row.id,
    app: sanitizeAppRow(app),
    plaintext,
    keyPrefix,
    scopes: [...granted],
    expiresAt: expiresAt || null,
  };
}

/**
 * Verify a presented plaintext key for an organization. Returns sanitized
 * `{ key, app }` — the plaintext and hash are never echoed back.
 */
async function verifyDeveloperKey({ plaintext, organizationId }) {
  if (!plaintext || !organizationId) {
    throw developerKeyError('Invalid developer credentials', 401, 'DEVELOPER_KEY_INVALID');
  }
  const keyHash = hashKey(plaintext);
  const rows = await supabase.select('developer_api_keys', { filters: { key_hash: keyHash }, limit: 1 });
  const row = firstRow(rows);
  if (!row || !safeEqualHex(row.key_hash, keyHash)) {
    throw developerKeyError('Invalid developer credentials', 401, 'DEVELOPER_KEY_INVALID');
  }
  if (row.revoked_at) {
    throw developerKeyError('Developer key is revoked', 401, 'DEVELOPER_KEY_REVOKED');
  }
  if (isExpired(row)) {
    throw developerKeyError('Developer key is expired', 401, 'DEVELOPER_KEY_EXPIRED');
  }
  const app = await findAppById(row.app_id);
  assertAppUsable(app);
  assertSameOrg(app, organizationId);
  return { key: sanitizeKeyRow(row), app: sanitizeAppRow(app) };
}

/**
 * Rotate a key: mint a successor (`rotation_of` = old id) while the old key
 * stays valid for the overlap window. The caller revokes the old key after
 * the grace period via `revokeDeveloperKey`.
 */
async function rotateDeveloperKey({ keyId, organizationId }) {
  if (!keyId || !organizationId) {
    throw developerKeyError('keyId and organizationId are required', 400, 'DEVELOPER_ROTATE_REQUIRED');
  }
  const rows = await supabase.select('developer_api_keys', { filters: { id: keyId }, limit: 1 });
  const old = firstRow(rows);
  if (!old) {
    throw developerKeyError('Developer key not found', 404, 'DEVELOPER_KEY_NOT_FOUND');
  }
  if (old.revoked_at) {
    throw developerKeyError('Developer key is revoked', 401, 'DEVELOPER_KEY_REVOKED');
  }
  const app = await findAppById(old.app_id);
  assertAppUsable(app);
  assertSameOrg(app, organizationId);

  const plaintext = generatePlaintextKey();
  const keyHash = hashKey(plaintext);
  const keyPrefix = plaintext.slice(0, STORED_PREFIX_CHARS);
  const inserted = await supabase.insert('developer_api_keys', {
    app_id: old.app_id,
    key_prefix: keyPrefix,
    key_hash: keyHash,
    scopes: Array.isArray(old.scopes) ? [...old.scopes] : [],
    expires_at: old.expires_at || null,
    rotation_of: old.id,
  });
  const row = firstRow(inserted) || { id: null };

  // NOTE: `plaintext` is returned here and nowhere else. Never log it.
  return {
    id: row.id,
    app: sanitizeAppRow(app),
    plaintext,
    keyPrefix,
    scopes: Array.isArray(old.scopes) ? [...old.scopes] : [],
    rotationOf: old.id,
  };
}

/** Revoke a key immediately and permanently (end of the rotation overlap). */
async function revokeDeveloperKey({ keyId, organizationId }) {
  if (!keyId || !organizationId) {
    throw developerKeyError('keyId and organizationId are required', 400, 'DEVELOPER_REVOKE_REQUIRED');
  }
  const rows = await supabase.select('developer_api_keys', { filters: { id: keyId }, limit: 1 });
  const row = firstRow(rows);
  if (!row) {
    throw developerKeyError('Developer key not found', 404, 'DEVELOPER_KEY_NOT_FOUND');
  }
  const app = await findAppById(row.app_id);
  if (!app) {
    throw developerKeyError('Developer app not found', 404, 'DEVELOPER_APP_NOT_FOUND');
  }
  assertSameOrg(app, organizationId);
  await supabase.update(
    'developer_api_keys',
    { revoked_at: new Date().toISOString() },
    { id: keyId }
  );
  return { id: keyId, revoked: true };
}

/**
 * Best-effort `last_used_at` touch. Never throws — observability must not
 * break the request path (e.g. pre-migration runs where the table is absent).
 */
async function touchLastUsed(keyId) {
  if (!keyId) return false;
  try {
    await supabase.update(
      'developer_api_keys',
      { last_used_at: new Date().toISOString() },
      { id: keyId }
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  KEY_PREFIX,
  DEVELOPER_KEY_RATE_LIMIT,
  developerKeyRateKey,
  hashKey,
  safeEqualHex,
  sanitizeKeyRow,
  sanitizeAppRow,
  mintDeveloperKey,
  verifyDeveloperKey,
  rotateDeveloperKey,
  revokeDeveloperKey,
  touchLastUsed,
};
