-- Migration: 113_onboarding_v3
-- Versioned, organization-scoped persistence for the SaaS onboarding V3 flow.
-- Credentials are intentionally not represented in this schema. Operational
-- passwords continue to travel directly to /api/saas/bootstrap-admin only.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS legal_business_name TEXT,
  ADD COLUMN IF NOT EXISTS support_email TEXT,
  ADD COLUMN IF NOT EXISTS support_phone TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_business_type_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_business_type_check
      CHECK (business_type IS NULL OR business_type IN ('single_brand', 'aggregator'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_country_code_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_country_code_check
      CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS organization_onboarding_v3 (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  version SMALLINT NOT NULL DEFAULT 3 CHECK (version = 3),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'finalized')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  current_step_id TEXT NOT NULL DEFAULT 'business_type'
    CHECK (current_step_id IN ('business_type', 'basics', 'branding', 'operations', 'launch', 'review')),
  skipped_step_ids TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  draft JSONB NOT NULL DEFAULT '{"version":3,"currentStepId":"business_type","skippedStepIds":[]}'::JSONB,
  final_payload JSONB,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_onboarding_v3_skipped_steps_check CHECK (
    skipped_step_ids <@ ARRAY['branding']::TEXT[]
  ),
  CONSTRAINT organization_onboarding_v3_finalized_payload_check CHECK (
    (status = 'in_progress' AND finalized_at IS NULL)
    OR
    (status = 'finalized' AND finalized_at IS NOT NULL AND final_payload IS NOT NULL)
  )
);

COMMENT ON TABLE organization_onboarding_v3 IS
  'Organization-scoped SaaS onboarding V3 draft/final snapshot. Must never contain passwords, API keys, tokens, or credentials.';
COMMENT ON COLUMN organization_onboarding_v3.draft IS
  'Autosave-safe onboarding answers only. Operational passwords are forbidden.';
COMMENT ON COLUMN organization_onboarding_v3.final_payload IS
  'Validated final onboarding snapshot; intentionally excludes operational credentials.';

CREATE INDEX IF NOT EXISTS organization_onboarding_v3_status_idx
  ON organization_onboarding_v3(status);

CREATE TABLE IF NOT EXISTS organization_launch_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'onboarding_v3',
  task_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'setup',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'dismissed')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_launch_checklist_org_source_key_uq
    UNIQUE (organization_id, source, task_key)
);

CREATE INDEX IF NOT EXISTS organization_launch_checklist_items_org_status_idx
  ON organization_launch_checklist_items(organization_id, status, sort_order, created_at);

COMMENT ON TABLE organization_launch_checklist_items IS
  'Post-onboarding setup tasks. Generated from skipped optional setup and launch intentions.';

-- These tables are server-owned. The API authenticates with Clerk and performs
-- organization scoping before using the service-role database connection. No
-- browser Supabase session should be able to read or write onboarding drafts.
ALTER TABLE organization_onboarding_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_launch_checklist_items ENABLE ROW LEVEL SECURITY;

-- Finalization is deliberately one database transaction. The API validates the
-- V3 payload and computes checklist items before calling this function. This
-- function atomically writes the organization profile, tenant defaults, final
-- onboarding snapshot, and checklist so a partial HTTP failure cannot leave an
-- organization marked complete with only half of its core state persisted.
CREATE OR REPLACE FUNCTION finalize_organization_onboarding_v3(
  p_organization_id UUID,
  p_expected_revision INTEGER,
  p_final_payload JSONB,
  p_checklist JSONB DEFAULT '[]'::JSONB
)
RETURNS SETOF organization_onboarding_v3
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row organization_onboarding_v3%ROWTYPE;
  v_basics JSONB;
  v_item JSONB;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_row
  FROM organization_onboarding_v3
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding draft not found' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.status = 'finalized' THEN
    RAISE EXCEPTION 'Onboarding is already finalized' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Onboarding draft revision conflict' USING ERRCODE = '40001';
  END IF;

  IF p_final_payload IS NULL OR jsonb_typeof(p_final_payload) <> 'object' THEN
    RAISE EXCEPTION 'Final onboarding payload is required' USING ERRCODE = '22023';
  END IF;

  v_basics := p_final_payload -> 'basics';

  UPDATE organizations
  SET
    name = COALESCE(NULLIF(v_basics ->> 'businessName', ''), name),
    public_ref = COALESCE(NULLIF(v_basics ->> 'publicRef', ''), public_ref),
    business_type = p_final_payload ->> 'businessType',
    country_code = NULLIF(v_basics ->> 'countryCode', ''),
    legal_business_name = NULLIF(v_basics ->> 'legalBusinessName', ''),
    support_email = NULLIF(v_basics ->> 'supportEmail', ''),
    support_phone = NULLIF(v_basics ->> 'supportPhone', ''),
    onboarding_completed_at = v_now,
    updated_at = v_now
  WHERE id = p_organization_id;

  INSERT INTO organization_platform_settings (organization_id, key, value, updated_at)
  VALUES
    (p_organization_id, 'default_currency', upper(COALESCE(v_basics ->> 'currencyCode', 'GBP')), v_now),
    (p_organization_id, 'default_language', COALESCE(NULLIF(v_basics ->> 'defaultLanguage', ''), 'en'), v_now),
    (p_organization_id, 'business_country_code', upper(COALESCE(v_basics ->> 'countryCode', '')), v_now)
  ON CONFLICT (organization_id, key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

  DELETE FROM organization_launch_checklist_items
  WHERE organization_id = p_organization_id
    AND source = 'onboarding_v3';

  IF p_checklist IS NOT NULL AND jsonb_typeof(p_checklist) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_checklist)
    LOOP
      INSERT INTO organization_launch_checklist_items (
        organization_id,
        source,
        task_key,
        title,
        description,
        category,
        status,
        sort_order,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        p_organization_id,
        'onboarding_v3',
        v_item ->> 'taskKey',
        v_item ->> 'title',
        NULLIF(v_item ->> 'description', ''),
        COALESCE(NULLIF(v_item ->> 'category', ''), 'setup'),
        'pending',
        COALESCE((v_item ->> 'sortOrder')::INTEGER, 0),
        COALESCE(v_item -> 'metadata', '{}'::JSONB),
        v_now,
        v_now
      )
      ON CONFLICT (organization_id, source, task_key)
      DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        sort_order = EXCLUDED.sort_order,
        metadata = EXCLUDED.metadata,
        status = CASE
          WHEN organization_launch_checklist_items.status = 'completed' THEN 'completed'
          ELSE 'pending'
        END,
        updated_at = EXCLUDED.updated_at;
    END LOOP;
  END IF;

  UPDATE organization_onboarding_v3
  SET
    status = 'finalized',
    final_payload = p_final_payload,
    finalized_at = v_now,
    current_step_id = 'review',
    revision = revision + 1,
    updated_at = v_now
  WHERE organization_id = p_organization_id;

  RETURN QUERY
  SELECT * FROM organization_onboarding_v3
  WHERE organization_id = p_organization_id;
END;
$$;

-- Reset is also atomic so stale onboarding-generated checklist items can never
-- survive after a user starts the flow over.
CREATE OR REPLACE FUNCTION reset_organization_onboarding_v3(p_organization_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM organization_launch_checklist_items
  WHERE organization_id = p_organization_id
    AND source = 'onboarding_v3';

  DELETE FROM organization_onboarding_v3
  WHERE organization_id = p_organization_id
    AND status = 'in_progress';
END;
$$;

-- SECURITY DEFINER RPCs must not be callable directly from anon/authenticated
-- Supabase clients. Only the backend service-role connection may execute them.
REVOKE ALL ON FUNCTION finalize_organization_onboarding_v3(UUID, INTEGER, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION finalize_organization_onboarding_v3(UUID, INTEGER, JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION finalize_organization_onboarding_v3(UUID, INTEGER, JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION finalize_organization_onboarding_v3(UUID, INTEGER, JSONB, JSONB) TO service_role;

REVOKE ALL ON FUNCTION reset_organization_onboarding_v3(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION reset_organization_onboarding_v3(UUID) FROM anon;
REVOKE ALL ON FUNCTION reset_organization_onboarding_v3(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION reset_organization_onboarding_v3(UUID) TO service_role;
