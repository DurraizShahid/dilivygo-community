-- Canonical message-delivery ledger (Phase 06: communications provider standardization).
--
-- Purpose: correlate Dilivygo message attempts <-> provider message ids <->
-- correlation keys <-> delivery/bounce/complaint webhook events, so retries,
-- duplicate/queue re-deliveries, and the Resend delivery callback can resolve
-- provider truth without guessing. Written best-effort by
-- services/messaging-provider.js — ledger writes never fail the send itself
-- (they warn and continue, and tolerate a missing table so deploy order
-- between code and migration is safe).
--
-- Lifecycle: insert on send attempt (status = provider acceptance at call
-- time: 'queued' for async Resend/Twilio acceptance, 'sent' for synchronous
-- FCM confirmation); update to terminal states on delivery-callback receipt
-- ('sent' on delivered, 'failed' on bounce/complaint) via
-- controllers/messaging-webhook.controller.js. A 'failed' row never blocks a
-- later retry — duplicate suppression applies to 'sent'/'queued' rows only.
--
-- Idempotency: UNIQUE(correlation_key) partial index. Same logical message
-- retried (same key, e.g. `otp:{org}:{channel}:{digest}:{window}`) returns
-- the original provider_message_id instead of double-sending. Concurrent
-- racers: the UNIQUE constraint decides the winner; the loser logs a 409 and
-- returns the original row on re-read.
--
-- Rollout: additive + idempotent (IF NOT EXISTS everywhere). New table, so no
-- backfill (the adapter writes going forward; historical sends stay
-- uncorrelated). organization_id is NULL for pre-auth sends (e.g. OTP before
-- the org is resolved — key still carries the org scope). No FK to
-- organizations/orders: a hard FK would couple deployment ordering and block
-- pre-auth writes. Safe to apply any time; readers/writers degrade cleanly
-- when the table is absent.
-- Do NOT run the migration runner without DB credentials; validate by re-read.

CREATE TABLE IF NOT EXISTS message_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NULL,
  channel TEXT NOT NULL
    CONSTRAINT message_deliveries_channel_check
    CHECK (channel IN ('email', 'sms', 'push')),
  correlation_key TEXT NULL,
  provider TEXT NOT NULL,
  provider_message_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CONSTRAINT message_deliveries_status_check
    CHECK (status IN ('queued', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1
    CONSTRAINT message_deliveries_attempts_check
    CHECK (attempts >= 1),
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: one row per logical message (partial so NULL keys,
-- e.g. legacy/unkeyed writes, never collide). Retry-safe by construction.
CREATE UNIQUE INDEX IF NOT EXISTS message_deliveries_correlation_key_uq
  ON message_deliveries (correlation_key)
  WHERE correlation_key IS NOT NULL;

-- Tenant timeline: per-organization delivery views ordered by creation.
CREATE INDEX IF NOT EXISTS message_deliveries_org_created_idx
  ON message_deliveries (organization_id, created_at);

-- Operations scan: unsettled/failed rows by state.
CREATE INDEX IF NOT EXISTS message_deliveries_status_idx
  ON message_deliveries (status);

-- Webhook lookup: provider delivery receipt -> internal row.
CREATE INDEX IF NOT EXISTS message_deliveries_provider_message_idx
  ON message_deliveries (provider, provider_message_id);
