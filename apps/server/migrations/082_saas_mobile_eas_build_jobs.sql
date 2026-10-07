-- Migration: 082_saas_mobile_eas_build_jobs
--
-- Tracks EAS preview (internal-distribution) mobile builds queued from the
-- org-scoped app-builder or SaaS dashboard. GitHub Actions runs `eas build`
-- and reports completion via POST /api/internal/eas-build-webhook.

CREATE TABLE IF NOT EXISTS saas_mobile_eas_build_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN ('customer', 'rider', 'vendor')),
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  expo_public_project_ref TEXT NOT NULL,
  restaurant_refs TEXT NULL,
  github_run_id TEXT NULL,
  github_run_url TEXT NULL,
  eas_build_id TEXT NULL,
  install_page_url TEXT NULL,
  error_message TEXT NULL,
  requested_by_member_id UUID NULL REFERENCES organization_members (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_mobile_eas_build_jobs_org_created
  ON saas_mobile_eas_build_jobs (organization_id, created_at DESC);

COMMENT ON TABLE saas_mobile_eas_build_jobs IS
  'EAS preview build jobs for org-scoped mobile exports (app-builder / SaaS).';
