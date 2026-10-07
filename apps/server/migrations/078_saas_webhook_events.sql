-- Idempotency ledger for SaaS webhook deliveries (Clerk today, more later).
--
-- Clerk and other providers may retry webhook deliveries if they don't receive
-- a 2xx response quickly enough, and the same Svix event id can arrive twice
-- in rapid succession. `provisionForClerkUser` is mostly idempotent at the
-- row level, but concurrent replays can race before the first transaction
-- commits and end up double-creating organizations. Inserting the event id
-- into this table (with `UNIQUE (provider, event_id)`) before doing any work
-- turns the idempotency check into a single atomic operation — if the insert
-- hits the unique constraint, we know the event is already being (or was)
-- processed and can return 200 immediately.
--
-- Rows older than 30 days are useless; a scheduled job or cron can trim them.

CREATE TABLE IF NOT EXISTS saas_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT saas_webhook_events_uq UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS saas_webhook_events_received_at_idx
  ON saas_webhook_events (received_at DESC);
