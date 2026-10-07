-- Migration: 114_cx_survey_engine
-- Production survey builder with immutable published versions, steps/pages, rich question types, validation and conditional logic.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Definitions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_survey_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_ref TEXT,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb, -- {workspaceId, shopId, orderType, deliveryType, campaign}
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  current_version_id UUID,
  created_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cx_survey_definitions_org_key_unique UNIQUE (organization_id, key)
);

CREATE INDEX IF NOT EXISTS cx_survey_definitions_org_status_idx
  ON cx_survey_definitions (organization_id, status);

CREATE INDEX IF NOT EXISTS cx_survey_definitions_org_project_idx
  ON cx_survey_definitions (organization_id, project_ref) WHERE project_ref IS NOT NULL;

-- ─── Versions (immutable snapshots) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_survey_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  survey_id UUID NOT NULL REFERENCES cx_survey_definitions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  title TEXT,
  description TEXT,
  -- Frozen builder snapshot: { steps: [{id,title,questionKeys:[]}], questions: [{key,prompt,type,required,config,visibilityCondition}], validation: {} }
  schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cx_survey_versions_survey_version_unique UNIQUE (survey_id, version)
);

CREATE INDEX IF NOT EXISTS cx_survey_versions_org_survey_idx
  ON cx_survey_versions (organization_id, survey_id, version DESC);

CREATE INDEX IF NOT EXISTS cx_survey_versions_status_idx
  ON cx_survey_versions (organization_id, status, published_at DESC);

-- FK backlink from definitions -> current_version (deferred to allow circular)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cx_survey_definitions_current_version_fk'
  ) THEN
    ALTER TABLE cx_survey_definitions
      ADD CONSTRAINT cx_survey_definitions_current_version_fk
      FOREIGN KEY (current_version_id) REFERENCES cx_survey_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Grants (service_role only) ───────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_survey_definitions') THEN
    REVOKE ALL ON TABLE cx_survey_definitions FROM anon, authenticated;
    GRANT ALL ON TABLE cx_survey_definitions TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_survey_versions') THEN
    REVOKE ALL ON TABLE cx_survey_versions FROM anon, authenticated;
    GRANT ALL ON TABLE cx_survey_versions TO service_role;
  END IF;
END $$;

COMMENT ON TABLE cx_survey_definitions IS
  'Survey definition per organization. Key is unique per org. Current_version_id points to latest published version; drafts are pending versions not yet published.';

COMMENT ON TABLE cx_survey_versions IS
  'Immutable survey version snapshot. Published versions are never mutated; editing a draft creates a new draft version or updates the latest draft. Schema JSON holds steps/pages and questions with conditional visibility.';
