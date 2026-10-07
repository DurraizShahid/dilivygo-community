-- Phase 7B.1: Provider retry concurrency hardening & crash-safe retry leases.
--
-- Enables atomic claim and lease tracking on message_deliveries so that at most
-- one worker is authorized to invoke external messaging providers for any
-- logical delivery at a time.
--
-- Rollout: additive, idempotent (IF NOT EXISTS).

ALTER TABLE message_deliveries
  ADD COLUMN IF NOT EXISTS retry_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS retry_lease_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS retry_owner TEXT NULL;

-- Update status check constraint to include 'retrying'
ALTER TABLE message_deliveries
  DROP CONSTRAINT IF EXISTS message_deliveries_status_check;

ALTER TABLE message_deliveries
  ADD CONSTRAINT message_deliveries_status_check
  CHECK (status IN ('queued', 'sent', 'failed', 'retrying'));

-- Partial index for fast lease scans / expired lease recovery
CREATE INDEX IF NOT EXISTS message_deliveries_retry_lease_idx
  ON message_deliveries (status, retry_lease_expires_at)
  WHERE status = 'retrying';
