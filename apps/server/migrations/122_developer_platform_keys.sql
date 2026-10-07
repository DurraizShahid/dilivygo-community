-- Migration: 122_developer_platform_keys
--
-- Phase 14 (Integration Marketplace & Developer Platform Foundations).
-- Per-app developer credentials with rotation + revocation for the future
-- developer API surface (`lib/developer-scopes.js`,
-- `services/developer-keys.service.js`). NOTHING is mounted in this phase,
-- so these tables are write-only foundations until the main session wires
-- routes + key authentication.
--
-- Tables:
-- 1. `developer_apps`: one row per developer application. `organization_id`
--    is the tenant root (every key inherits its org via the app row —
--    cross-org key use is denied in the service layer). `trust_level` is
--    first-party | partner | custom (caps the issuable scope set; see
--    TRUST_LEVEL_SCOPES). `created_by` is the Clerk user id of the issuer
--    (opaque text, no FK — SaaS identity lives outside this database).
-- 2. `developer_api_keys`: one row per issued secret. ONLY the SHA-256 hex
--    digest (`key_hash`) is stored — plaintext is returned exactly once at
--    mint/rotation and never persisted, logged, or returned again.
--    `key_prefix` (`dilivygo_` + a few chars) is a NON-SECRET support
--    identifier. `scopes` is a subset of the DEVELOPER_SCOPES allowlist.
--    `rotation_of` points at the superseded key during the grace overlap.
--
-- Rotation (grace overlap, enforced by convention + service code):
--   1. rotate → new row with rotation_of = <old id>; old key stays valid.
--   2. operator deploys the new secret everywhere during the grace window.
--   3. revoke → old row gets revoked_at; verification rejects it immediately.
--
-- Per-key rate limits (service-level convention, see
-- DEVELOPER_KEY_RATE_LIMIT): limiters key on a one-way digest of
-- (organization_id, key id) so one key cannot starve sibling keys. No
-- DB object is needed for that; documented here for operators.
--
-- Tenancy: rows are organization-rooted (no project_ref — developer apps
-- belong to the organization marketplace model, migration 077). Reads MUST
-- always filter by organization via the app row; the UNIQUE(key_hash)
-- constraint is global (hashes are random and carry no tenant signal).
--
-- Rollback: DROP TABLE IF EXISTS developer_api_keys, developer_apps
-- (keys are replaceable secrets; revoking + re-minting after restore is
-- the recovery path — there is no secret material to preserve).
-- Backfill: none required — both tables start empty; the service throws
-- DEVELOPER_APP_NOT_FOUND / DEVELOPER_KEY_INVALID on pre-migration runs.
--
-- NOTE: created but NOT applied in this phase (no migration runner run per
-- phase constraints). Apply with:
--   npm run migrate --workspace=dilivygo-backend

CREATE TABLE IF NOT EXISTS developer_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trust_level TEXT NOT NULL DEFAULT 'custom'
    CHECK (trust_level IN ('first-party', 'partner', 'custom')),
  created_by TEXT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT developer_apps_name_not_empty CHECK (char_length(name) > 0)
);

CREATE INDEX IF NOT EXISTS idx_developer_apps_org
  ON developer_apps (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS developer_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES developer_apps (id) ON DELETE CASCADE,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  expires_at TIMESTAMPTZ NULL,
  last_used_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  rotation_of UUID NULL REFERENCES developer_api_keys (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT developer_api_keys_hash_not_empty CHECK (char_length(key_hash) > 0)
);

CREATE INDEX IF NOT EXISTS idx_developer_api_keys_app
  ON developer_api_keys (app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_developer_api_keys_prefix
  ON developer_api_keys (key_prefix);

CREATE INDEX IF NOT EXISTS idx_developer_api_keys_rotation
  ON developer_api_keys (rotation_of)
  WHERE rotation_of IS NOT NULL;
