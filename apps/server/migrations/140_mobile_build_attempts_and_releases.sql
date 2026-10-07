-- Migration: 117_mobile_build_attempts_and_releases
--
-- Phase 08 (mobile app builder / build & publishing).
--
-- 1. `saas_mobile_eas_build_attempts`: immutable per-attempt history for EAS
--    preview builds. Retries insert NEW rows here (never mutate history); the
--    parent `saas_mobile_eas_build_jobs` row keeps only the current-status
--    pointer. See `services/eas-org-build.service.js` (`planBuildRetry`).
-- 2. `saas_mobile_app_releases`: explicit App Store / Google Play publishing
--    records with manual-gate states
--    (`submitted/in-review/approved/rejected/rolled-back`).
-- 3. Widens the `saas_mobile_eas_build_jobs.status` CHECK with the canonical
--    in-progress value `building` (the GitHub webhook keeps writing the
--    legacy value `running` — both are accepted by the service state machine).
--
-- Signing boundary: neither table has any column for private signing
-- material (keystores, .p8/.p12, service-account JSON, tokens). Credentials
-- live in EAS / server env only. `log_tail` / `error_message` are stored
-- redacted + truncated by the service before insert.
--
-- Rollback: DROP TABLE IF EXISTS saas_mobile_app_releases,
-- saas_mobile_eas_build_attempts. Re-narrowing the jobs status CHECK is only
-- safe when no row holds status = 'building'.
-- Backfill: none required — new tables start empty; existing jobs keep their
-- status values (all still permitted by the widened CHECK).

CREATE TABLE IF NOT EXISTS saas_mobile_eas_build_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES saas_mobile_eas_build_jobs (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'building', 'running', 'succeeded', 'failed', 'cancelled')),
  eas_build_id TEXT NULL,
  github_run_id TEXT NULL,
  github_run_url TEXT NULL,
  log_tail TEXT NULL,
  error_message TEXT NULL,
  artifact_platform TEXT NULL CHECK (artifact_platform IN ('android', 'ios')),
  artifact_url TEXT NULL,
  app_version TEXT NULL,
  created_by_member_id UUID NULL REFERENCES organization_members (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT saas_mobile_eas_build_attempts_job_attempt_uq UNIQUE (job_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_eas_build_attempts_job
  ON saas_mobile_eas_build_attempts (job_id, attempt_number ASC);

CREATE INDEX IF NOT EXISTS idx_eas_build_attempts_org_created
  ON saas_mobile_eas_build_attempts (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saas_mobile_app_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN ('customer', 'rider', 'vendor')),
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  build_job_id UUID NULL REFERENCES saas_mobile_eas_build_jobs (id) ON DELETE SET NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'in-review', 'approved', 'rejected', 'rolled-back')),
  ota_channel TEXT NULL CHECK (ota_channel IN ('preview', 'production')),
  runtime_version TEXT NULL,
  notes TEXT NULL,
  external_ref TEXT NULL,
  submitted_by_member_id UUID NULL REFERENCES organization_members (id) ON DELETE SET NULL,
  decided_by_member_id UUID NULL REFERENCES organization_members (id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobile_app_releases_org_created
  ON saas_mobile_app_releases (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mobile_app_releases_org_status
  ON saas_mobile_app_releases (organization_id, status);

-- Widen the jobs status CHECK to admit the canonical `building` value.
-- Idempotent: drops the column-default-named constraint if present, then
-- re-adds it with the wider set (all pre-existing values remain permitted).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'saas_mobile_eas_build_jobs') THEN
    ALTER TABLE saas_mobile_eas_build_jobs DROP CONSTRAINT IF EXISTS saas_mobile_eas_build_jobs_status_check;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'saas_mobile_eas_build_jobs_status_check'
    ) THEN
      ALTER TABLE saas_mobile_eas_build_jobs
        ADD CONSTRAINT saas_mobile_eas_build_jobs_status_check
        CHECK (status IN ('queued', 'building', 'running', 'succeeded', 'failed', 'cancelled'));
    END IF;
  END IF;
END
$$;

COMMENT ON TABLE saas_mobile_eas_build_attempts IS
  'Immutable per-attempt history for org EAS preview builds (Phase 08). Retries insert new rows; never update in place.';
COMMENT ON TABLE saas_mobile_app_releases IS
  'Manual-gate store publishing records (submitted/in-review/approved/rejected/rolled-back). No signing material stored.';
