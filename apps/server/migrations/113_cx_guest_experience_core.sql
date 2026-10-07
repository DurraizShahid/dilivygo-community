-- Migration: 113_cx_guest_experience_core
-- Tenant-safe CX foundation: feedback submissions, answers, metric scores,
-- categories/tags, cases and timeline events.
-- All tables are organization-scoped (organization_id NOT NULL) and link to
-- canonical customers/orders/shops without duplicating those entities.
-- Follows existing conventions: additive, idempotent (IF NOT EXISTS), additive indexes.

-- Enable pgcrypto for gen_random_uuid if not already
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── CX Categories ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES cx_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cx_categories_org_slug_unique UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS cx_categories_org_parent_idx
  ON cx_categories (organization_id, parent_id);

COMMENT ON TABLE cx_categories IS
  'CX taxonomy categories — per-organization hierarchy for feedback tagging and case classification.';

-- ─── CX Tags ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cx_tags_org_slug_unique UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS cx_tags_org_idx ON cx_tags (organization_id);

COMMENT ON TABLE cx_tags IS
  'Free-form CX tags for feedback and case annotation. Scoped per organization.';

-- ─── CX Feedback Submissions (canonical feedback row) ───────────────────────
CREATE TABLE IF NOT EXISTS cx_feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_ref TEXT,
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  -- Survey / external provenance (nullable until P02/P13 fill them)
  survey_response_id UUID,
  external_review_id UUID,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('survey', 'order_triggered', 'external_review', 'manual', 'pos', 'whatsapp', 'webhook', 'import')),
  channel TEXT NOT NULL DEFAULT 'api'
    CHECK (channel IN ('web', 'mobile', 'in_store', 'whatsapp', 'email', 'sms', 'api', 'import', 'pos')),
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'triaged', 'escalated', 'resolved', 'archived')),
  overall_rating SMALLINT CHECK (overall_rating BETWEEN 1 AND 5),
  comment TEXT,
  -- Category/tag linkage
  category_id UUID REFERENCES cx_categories(id) ON DELETE SET NULL,
  -- Durable order snapshot for historical integrity (minimal fields)
  order_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Authorship for audit
  created_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_by_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_feedback_org_shop_time_idx
  ON cx_feedback_submissions (organization_id, shop_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS cx_feedback_org_customer_idx
  ON cx_feedback_submissions (organization_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cx_feedback_org_status_idx
  ON cx_feedback_submissions (organization_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS cx_feedback_order_idx
  ON cx_feedback_submissions (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cx_feedback_category_idx
  ON cx_feedback_submissions (category_id)
  WHERE category_id IS NOT NULL;

COMMENT ON TABLE cx_feedback_submissions IS
  'Core CX feedback row. Links to canonical customers/orders/shops without duplicating them. order_snapshot preserves immutable order fields at submission time.';

-- Join table for many-to-many feedback ↔ tags
CREATE TABLE IF NOT EXISTS cx_feedback_tags (
  submission_id UUID NOT NULL REFERENCES cx_feedback_submissions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES cx_tags(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, tag_id)
);

CREATE INDEX IF NOT EXISTS cx_feedback_tags_org_tag_idx
  ON cx_feedback_tags (organization_id, tag_id);

CREATE INDEX IF NOT EXISTS cx_feedback_tags_submission_idx
  ON cx_feedback_tags (submission_id);

-- ─── CX Feedback Answers (structured answers per submission) ────────────────
CREATE TABLE IF NOT EXISTS cx_feedback_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES cx_feedback_submissions(id) ON DELETE CASCADE,
  survey_question_id UUID,
  question_key TEXT NOT NULL,
  answer_type TEXT NOT NULL
    CHECK (answer_type IN ('nps', 'csat', 'ces', 'rating', 'boolean', 'text', 'choice', 'multi_choice')),
  numeric_value INTEGER,
  text_value TEXT,
  choice_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cx_feedback_answers_submission_key_unique UNIQUE (submission_id, question_key)
);

CREATE INDEX IF NOT EXISTS cx_feedback_answers_org_submission_idx
  ON cx_feedback_answers (organization_id, submission_id);

COMMENT ON TABLE cx_feedback_answers IS
  'Structured answers for a feedback submission (NPS/CSAT/CES + custom). One row per question_key.';

-- ─── CX Metric Scores (derived KPI per submission) ─────────────────────────
CREATE TABLE IF NOT EXISTS cx_metric_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES cx_feedback_submissions(id) ON DELETE CASCADE,
  nps_score SMALLINT CHECK (nps_score BETWEEN 0 AND 10),
  nps_bucket TEXT CHECK (nps_bucket IN ('detractor', 'passive', 'promoter')),
  csat_score SMALLINT CHECK (csat_score BETWEEN 1 AND 5),
  ces_score SMALLINT CHECK (ces_score BETWEEN 1 AND 7),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cx_metric_scores_submission_unique UNIQUE (submission_id)
);

CREATE INDEX IF NOT EXISTS cx_metric_scores_org_idx
  ON cx_metric_scores (organization_id, computed_at DESC);

COMMENT ON TABLE cx_metric_scores IS
  'Derived NPS/CSAT/CES scores for each feedback submission. Materialized deterministically (no LLM).';

-- ─── CX Cases (complaint / escalation) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_ref TEXT,
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  feedback_submission_id UUID REFERENCES cx_feedback_submissions(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  -- Case taxonomy
  category_id UUID REFERENCES cx_categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'triaged', 'assigned', 'in_progress', 'awaiting_customer', 'resolved', 'closed', 'cancelled')),
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  priority SMALLINT NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  sla_due_at TIMESTAMPTZ,
  sla_breached BOOLEAN NOT NULL DEFAULT false,
  assigned_to_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_cases_org_status_sla_idx
  ON cx_cases (organization_id, status, sla_due_at);

CREATE INDEX IF NOT EXISTS cx_cases_org_customer_idx
  ON cx_cases (organization_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cx_cases_org_shop_idx
  ON cx_cases (organization_id, shop_id)
  WHERE shop_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cx_cases_feedback_idx
  ON cx_cases (feedback_submission_id)
  WHERE feedback_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cx_cases_assigned_idx
  ON cx_cases (assigned_to_user_id)
  WHERE assigned_to_user_id IS NOT NULL;

COMMENT ON TABLE cx_cases IS
  'CX complaint / escalation case. Linked to feedback submission and canonical customer/order/shop. Timeline events capture all transitions.';

-- ─── CX Case Timeline Events ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_case_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cx_cases(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL
    CHECK (actor_type IN ('customer', 'staff', 'system', 'ai')),
  actor_id UUID,
  event_type TEXT NOT NULL,
  -- e.g. created | status_changed | note | assignment | sla_breach | recovery_offered | recovery_redeemed | ai_classification | webhook_fired
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_case_timeline_case_time_idx
  ON cx_case_timeline_events (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cx_case_timeline_org_idx
  ON cx_case_timeline_events (organization_id, created_at DESC);

COMMENT ON TABLE cx_case_timeline_events IS
  'Append-only timeline for CX cases. Every status change, note, assignment, SLA or recovery action is recorded here.';

-- ─── Harden RLS: revoke anon/authenticated, service_role only (matches 110 style) ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_feedback_submissions') THEN
    REVOKE ALL ON TABLE cx_feedback_submissions FROM anon, authenticated;
    GRANT ALL ON TABLE cx_feedback_submissions TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_feedback_answers') THEN
    REVOKE ALL ON TABLE cx_feedback_answers FROM anon, authenticated;
    GRANT ALL ON TABLE cx_feedback_answers TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_metric_scores') THEN
    REVOKE ALL ON TABLE cx_metric_scores FROM anon, authenticated;
    GRANT ALL ON TABLE cx_metric_scores TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_categories') THEN
    REVOKE ALL ON TABLE cx_categories FROM anon, authenticated;
    GRANT ALL ON TABLE cx_categories TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_tags') THEN
    REVOKE ALL ON TABLE cx_tags FROM anon, authenticated;
    GRANT ALL ON TABLE cx_tags TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_feedback_tags') THEN
    REVOKE ALL ON TABLE cx_feedback_tags FROM anon, authenticated;
    GRANT ALL ON TABLE cx_feedback_tags TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_cases') THEN
    REVOKE ALL ON TABLE cx_cases FROM anon, authenticated;
    GRANT ALL ON TABLE cx_cases TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_case_timeline_events') THEN
    REVOKE ALL ON TABLE cx_case_timeline_events FROM anon, authenticated;
    GRANT ALL ON TABLE cx_case_timeline_events TO service_role;
  END IF;
END $$;
