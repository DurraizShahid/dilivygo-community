-- Durable inbound provider-webhook inbox (Phase 02: inbound durability).
--
-- Purpose: every inbound Nango webhook is persisted here BEFORE the connection
-- row is touched, so redeliveries, crashes, and handler failures are replayable
-- without provider cooperation.
--
-- Lifecycle (see ingestNangoWebhook in
-- apps/server/services/integration-connections.service.js):
--   received   -> row inserted right after HMAC verification + JSON parse.
--   processing -> handler started (attempts incremented).
--   succeeded  -> connection-update handler ran without throwing.
--   failed     -> handler (or JSON parse) threw; last_error holds a truncated,
--                 secret-redacted message. A future retry worker may pick these
--                 up via (status, next_attempt_at); next_attempt_at is NULL until
--                 such a worker schedules the row.
--   dead       -> dead-letter queue (DLQ) terminal state. Rows are NEVER
--                 deleted; a dead row is terminal for automatic processing but
--                 remains replayable on demand.
--
-- Replay model: replayInboundWebhookEvent({ organizationId, eventId, force })
-- loads the row scoped to organizationId (cross-org replay 404s), refuses
-- already-succeeded rows unless force=true, re-runs the same
-- connection-update handler, and records the attempt. Replay never invents a
-- new provider event: it reprocesses the stored payload.
--
-- Dedupe model: UNIQUE (provider_key, provider_event_id) WHERE
-- provider_event_id IS NOT NULL ignores redeliveries that carry a provider
-- delivery id. Webhooks without a delivery id (e.g. Nango auth webhooks) fall
-- back to an exact payload_hash lookup before insert.
--
-- Security: headers stores an allowlist ONLY (content-type, content-length,
-- user-agent, x-request-id). Authorization/cookie/secret/signature/token
-- headers and any credential material must never be persisted here; the
-- service layer sanitizes before insert and redacts secrets from last_error.

CREATE TABLE IF NOT EXISTS integration_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NULL,
  provider_key TEXT NOT NULL,
  provider_event_id TEXT NULL,
  connection_id TEXT NULL,
  received_at TIMESTAMPTZ DEFAULT now(),
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature_result TEXT NOT NULL DEFAULT 'unverified',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CONSTRAINT integration_webhook_events_status_check
    CHECK (status IN ('received', 'processing', 'succeeded', 'failed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  dead_at TIMESTAMPTZ NULL
);

-- Dedupe: one row per provider delivery id (partial so NULL ids never collide).
CREATE UNIQUE INDEX IF NOT EXISTS integration_webhook_events_provider_event_uq
  ON integration_webhook_events (provider_key, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

-- Worker pickup: retry/DLQ scans by processing state and due time.
CREATE INDEX IF NOT EXISTS integration_webhook_events_status_next_attempt_idx
  ON integration_webhook_events (status, next_attempt_at);

-- Tenant timeline: per-organization inbox views ordered by arrival.
CREATE INDEX IF NOT EXISTS integration_webhook_events_org_received_idx
  ON integration_webhook_events (organization_id, received_at);

-- Hash fallback: dedupe lookup for webhooks without a provider delivery id.
CREATE INDEX IF NOT EXISTS integration_webhook_events_payload_hash_idx
  ON integration_webhook_events (payload_hash);
