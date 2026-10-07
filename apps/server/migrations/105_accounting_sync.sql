-- Durable organization-scoped accounting synchronization ledger.
-- Provider OAuth credentials remain in Nango; this stores only sync state and
-- non-secret provider object identifiers for idempotency/auditability.

CREATE TABLE IF NOT EXISTS accounting_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  sync_mode TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'automatic',
  idempotency_key TEXT NOT NULL,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  source_count INTEGER NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT accounting_sync_jobs_provider_check CHECK (provider_key IN ('quickbooks','xero')),
  CONSTRAINT accounting_sync_jobs_mode_check CHECK (sync_mode IN ('daily-summary','per-order','payout-reconciliation','manual-export')),
  CONSTRAINT accounting_sync_jobs_trigger_check CHECK (trigger_type IN ('automatic','manual')),
  CONSTRAINT accounting_sync_jobs_status_check CHECK (status IN ('pending','processing','completed','partial','failed','skipped')),
  CONSTRAINT accounting_sync_jobs_org_provider_key_uq UNIQUE (organization_id, provider_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS accounting_sync_jobs_org_provider_status_idx
  ON accounting_sync_jobs (organization_id, provider_key, status, created_at DESC);

CREATE TABLE IF NOT EXISTS accounting_sync_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  job_id UUID REFERENCES accounting_sync_jobs(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_version TEXT NOT NULL DEFAULT 'v1',
  provider_object_type TEXT,
  provider_object_id TEXT,
  provider_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT accounting_sync_records_provider_check CHECK (provider_key IN ('quickbooks','xero')),
  CONSTRAINT accounting_sync_records_source_check CHECK (source_type IN ('sale','refund','daily_sales','daily_refunds','payout','processor_fee')),
  CONSTRAINT accounting_sync_records_status_check CHECK (status IN ('pending','posted','failed','skipped')),
  CONSTRAINT accounting_sync_records_source_version_uq UNIQUE (organization_id, provider_key, source_type, source_id, source_version)
);

CREATE INDEX IF NOT EXISTS accounting_sync_records_org_provider_status_idx
  ON accounting_sync_records (organization_id, provider_key, status, created_at DESC);

CREATE INDEX IF NOT EXISTS accounting_sync_records_source_idx
  ON accounting_sync_records (organization_id, provider_key, source_type, source_id);
