-- Migration: 124_cx_review_responses
-- Review response management (Phase 14): staff workflow for answering
-- external reviews with templates, assignment, approval-safe AI drafts,
-- and idempotent provider posting. Additive and idempotent. No seeds.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Response templates (org-owned content, human-authored) ────────────────
CREATE TABLE IF NOT EXISTS cx_response_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'professional'
    CHECK (tone IN ('professional', 'friendly', 'apologetic', 'formal')),
  -- Placeholders: {{reviewer_name}}, {{restaurant_name}}, {{rating}}.
  -- Rendered server-side on use; unknown placeholders render empty.
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS cx_response_templates_org_idx
  ON cx_response_templates (organization_id, is_active);

COMMENT ON TABLE cx_response_templates IS 'Human-authored reply templates. Placeholders filled from review + shop context only.';

-- ─── Review responses (workflow per external review) ──────────────────────
CREATE TABLE IF NOT EXISTS cx_review_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES cx_external_reviews(id) ON DELETE CASCADE,
  template_id UUID REFERENCES cx_response_templates(id) ON DELETE SET NULL,
  -- draft → needs_approval → approved → posted; failed on post errors.
  -- Editing body always resets to draft (re-approval required).
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'needs_approval', 'approved', 'posted', 'failed')),
  assigned_to_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  -- Current text: draft content, then the EXACT approved/posted text.
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  ai_drafted BOOLEAN NOT NULL DEFAULT false,
  ai_model TEXT,
  approved_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  posted_via TEXT CHECK (posted_via IS NULL OR posted_via IN ('adapter', 'manual_record')),
  posted_external_id TEXT,
  posted_at TIMESTAMPTZ,
  failure_reason TEXT,
  -- Replay-safe posting: one row per key per org; retries return the row.
  idempotency_key TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS cx_review_responses_review_idx
  ON cx_review_responses (review_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cx_review_responses_org_status_idx
  ON cx_review_responses (organization_id, status, updated_at DESC);

COMMENT ON TABLE cx_review_responses IS 'Staff reply workflow. Public text (body once approved) is strictly separated from internal notes (cx_response_notes). AI drafts are always drafts — never auto-approved or auto-posted.';
COMMENT ON COLUMN cx_review_responses.posted_external_id IS 'Provider-side reply id (adapter) or staff-recorded reference (manual_record). Set once; re-post with it set returns a replay, never a duplicate.';

-- ─── Internal notes (staff-only, never customer-facing) ───────────────────
CREATE TABLE IF NOT EXISTS cx_response_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  response_id UUID NOT NULL REFERENCES cx_review_responses(id) ON DELETE CASCADE,
  author_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_response_notes_response_idx
  ON cx_response_notes (response_id, created_at ASC);

COMMENT ON TABLE cx_response_notes IS 'Staff-only coordination notes. No customer-facing read path may select this table.';

-- ─── Harden RLS: service_role only (matches 113–123 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_response_templates') THEN
    REVOKE ALL ON TABLE cx_response_templates FROM anon, authenticated;
    GRANT ALL ON TABLE cx_response_templates TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_review_responses') THEN
    REVOKE ALL ON TABLE cx_review_responses FROM anon, authenticated;
    GRANT ALL ON TABLE cx_review_responses TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_response_notes') THEN
    REVOKE ALL ON TABLE cx_response_notes FROM anon, authenticated;
    GRANT ALL ON TABLE cx_response_notes TO service_role;
  END IF;
END $$;
