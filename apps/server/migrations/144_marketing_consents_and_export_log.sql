-- Migration: 121_marketing_consents_and_export_log
--
-- Phase 13 (Marketing, Social & Customer Engagement — CAPABILITY + CONSENT
-- framework). Persists the consent ledger and the export-audit ledger consumed
-- by `apps/server/services/marketing-provider.js`.
--
-- Tables:
-- 1. `marketing_consents`: explicit per-subject, per-purpose consent records.
--    One row per (organization_id, subject_type, subject_id, purpose).
--    `granted = true` + `granted_at` = active consent; revocation updates the
--    row to `granted = false` (history-preserving; rows are never deleted by
--    the capability — see offboarding doc
--    `docs/integrations/providers/marketing.md` §8 for the durable-deletion
--    checklist owned by the main-session wire-up).
--    `source` records WHERE consent was captured (e.g. 'checkout-opt-in',
--    'saas-dashboard', 'support-tool') for legal-basis auditability.
-- 2. `marketing_export_log`: append-only audit of every PII export that left
--    the boundary. Rows carry COUNTS and keys only — never subject identities,
--    emails, phones, or payloads. `idempotency_key` UNIQUE is the
--    duplicate-export prevention at the DB layer (mirrors the in-memory
--    `_recentExports` dedupe in the capability). `consent_verified` records
--    that the consent + tenant-flag gate passed for the export.
--
-- Tenancy: every row carries `organization_id` (→ `organizations(id)`
-- ON DELETE CASCADE, following migrations 070/073/119 conventions). Consent
-- isolation is per-organization: a grant in org A NEVER authorizes an export
-- in org B (enforced by the capability's consent lookup filters + covered by
-- `apps/server/tests/marketing-provider.test.js`).
--
-- No secrets here: consent/audit rows contain no tokens, keys, or provider
-- credentials (kit rule §6 — credentials stay in Nango; Dilivygo stores only
-- the opaque `connection_id` in `integration_connections`, migration 103).
--
-- Rollout / backfill: brand-new tables, no backfill (no prior consent rows
-- exist — Phase 13 audit confirms no customer consent/preferences storage).
-- The capability degrades pre-migration: consent lookups fail closed (403
-- MARKETING_CONSENT_REQUIRED) and export-audit writes fall back to the
-- in-memory mirror until this migration is applied.
-- Rollback: DROP TABLE IF EXISTS marketing_export_log, marketing_consents
-- (audit history is append-only evidence; dropping loses it — export before
-- rollback if retention policy requires it).
-- Runner: created only — NEVER run automatically; apply with
-- `npm run migrate --workspace=dilivygo-backend` where DB credentials exist.
--
-- NOTE: created but NOT applied in this phase (no migration runner run per
-- phase constraints).

CREATE TABLE IF NOT EXISTS marketing_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL
    CONSTRAINT marketing_consents_subject_type_check
    CHECK (subject_type IN ('customer')),
  subject_id TEXT NOT NULL,
  purpose TEXT NOT NULL
    CONSTRAINT marketing_consents_purpose_check
    CHECK (purpose IN ('marketing:audience-sync', 'marketing:event-export')),
  granted BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at TIMESTAMPTZ NULL,
  source TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_consents_org_subject_purpose_unique
    UNIQUE (organization_id, subject_type, subject_id, purpose)
);

-- Consent gate lookup: (org, subject, purpose) → granted row.
CREATE INDEX IF NOT EXISTS marketing_consents_gate_idx
  ON marketing_consents (organization_id, subject_type, subject_id, purpose);

-- Org-level consent administration / audit listing (newest first).
CREATE INDEX IF NOT EXISTS marketing_consents_org_idx
  ON marketing_consents (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS marketing_export_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL
    CONSTRAINT marketing_export_log_provider_check
    CHECK (provider_key IN ('google-business-profile', 'meta', 'instagram', 'whatsapp-business')),
  purpose TEXT NOT NULL
    CONSTRAINT marketing_export_log_purpose_check
    CHECK (purpose IN ('marketing:audience-sync', 'marketing:event-export')),
  subject_count INTEGER NOT NULL DEFAULT 0 CHECK (subject_count >= 0),
  consent_verified BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marketing_export_log_idempotency_unique
    UNIQUE (idempotency_key)
);

-- Duplicate-export prevention: redelivered export with the same key hits the
-- UNIQUE above instead of re-exporting PII.
-- Org-level export audit listing (newest first).
CREATE INDEX IF NOT EXISTS marketing_export_log_org_idx
  ON marketing_export_log (organization_id, created_at DESC);

-- Provider-level export audit (per-provider volumes + incident review).
CREATE INDEX IF NOT EXISTS marketing_export_log_provider_idx
  ON marketing_export_log (organization_id, provider_key, created_at DESC);
