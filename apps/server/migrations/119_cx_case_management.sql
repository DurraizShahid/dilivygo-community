-- Migration: 119_cx_case_management
-- Operational case workflow: extended lifecycle states, first-response/resolution
-- timestamps, internal-vs-customer timeline visibility, watchers, attachments
-- and category/shop/source routing rules. Additive and idempotent.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Extended lifecycle states ────────────────────────────────────────────
-- Existing: open, triaged, assigned, in_progress, awaiting_customer, resolved,
-- closed, cancelled. Added (Phase 7): contacted, resolution_offered,
-- recovered, recovery_failed. Old rows remain valid.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cx_cases_status_check'
      AND conrelid = 'public.cx_cases'::regclass
  ) THEN
    ALTER TABLE cx_cases DROP CONSTRAINT cx_cases_status_check;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cx_cases_status_check'
      AND conrelid = 'public.cx_cases'::regclass
  ) THEN
    ALTER TABLE cx_cases ADD CONSTRAINT cx_cases_status_check
      CHECK (status IN (
        'open', 'triaged', 'assigned', 'contacted', 'in_progress',
        'awaiting_customer', 'resolution_offered', 'resolved',
        'recovered', 'recovery_failed', 'closed', 'cancelled'
      ));
  END IF;
END $$;

-- ─── SLA / response-time clocks ───────────────────────────────────────────
ALTER TABLE cx_cases ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE cx_cases ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS cx_cases_sla_breach_scan_idx
  ON cx_cases (organization_id, sla_breached, sla_due_at)
  WHERE sla_breached = false AND sla_due_at IS NOT NULL;

COMMENT ON COLUMN cx_cases.first_response_at IS 'First staff/customer-visible response (note, contact log, or assignment). Set once, never overwritten.';
COMMENT ON COLUMN cx_cases.resolved_at IS 'When status first entered resolved/recovered. Resolution duration = resolved_at - created_at.';

-- ─── Timeline visibility (internal notes never exposed to customers) ───────
ALTER TABLE cx_case_timeline_events ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal'
  CHECK (visibility IN ('internal', 'customer'));

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cx_case_timeline_events_visibility_check'
      AND conrelid = 'public.cx_case_timeline_events'::regclass
  ) THEN
    ALTER TABLE cx_case_timeline_events ADD CONSTRAINT cx_case_timeline_events_visibility_check
      CHECK (visibility IN ('internal', 'customer'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cx_case_timeline_visibility_idx
  ON cx_case_timeline_events (case_id, visibility, created_at DESC);

COMMENT ON COLUMN cx_case_timeline_events.visibility IS 'internal = staff-only (notes, assignment, escalation). customer = safe to show (contact log, resolution). Customers never read internal events.';

-- ─── Watchers ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_case_watchers (
  case_id UUID NOT NULL REFERENCES cx_cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, user_id)
);

CREATE INDEX IF NOT EXISTS cx_case_watchers_user_idx
  ON cx_case_watchers (user_id, organization_id);

COMMENT ON TABLE cx_case_watchers IS 'Staff watching a case (notified on updates). Tenant-checked against the case org on write.';

-- ─── Attachments (files live in Supabase Storage; table holds refs) ───────
CREATE TABLE IF NOT EXISTS cx_case_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cx_cases(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  visibility TEXT NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal', 'customer')),
  uploaded_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_case_attachments_case_idx
  ON cx_case_attachments (case_id, created_at DESC);

COMMENT ON TABLE cx_case_attachments IS 'Case file refs (images via imageUpload→uploadImage into cx-attachments folder). Access enforced via parent case read.';

-- ─── Routing rules (category/shop/source → assignee, priority-ordered) ────
CREATE TABLE IF NOT EXISTS cx_case_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 10000),
  enabled BOOLEAN NOT NULL DEFAULT true,
  category_id UUID REFERENCES cx_categories(id) ON DELETE SET NULL,
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  source TEXT CHECK (source IN ('manual', 'negative_detection', 'survey', 'order_triggered', 'external_review', 'pos', 'whatsapp', 'webhook', 'import')),
  assigned_to_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_case_routing_rules_org_priority_idx
  ON cx_case_routing_rules (organization_id, enabled, priority ASC, created_at ASC);

COMMENT ON TABLE cx_case_routing_rules IS 'Deterministic case routing: first enabled rule (priority, created_at) whose specified matchers all hit wins. Fallback = leave unassigned.';

-- ─── Harden RLS: service_role only (matches 113/118 style) ────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_case_watchers') THEN
    REVOKE ALL ON TABLE cx_case_watchers FROM anon, authenticated;
    GRANT ALL ON TABLE cx_case_watchers TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_case_attachments') THEN
    REVOKE ALL ON TABLE cx_case_attachments FROM anon, authenticated;
    GRANT ALL ON TABLE cx_case_attachments TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_case_routing_rules') THEN
    REVOKE ALL ON TABLE cx_case_routing_rules FROM anon, authenticated;
    GRANT ALL ON TABLE cx_case_routing_rules TO service_role;
  END IF;
END $$;
