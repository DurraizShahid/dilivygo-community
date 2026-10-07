-- Canonical payment-operation ledger (Phase 03: Stripe reference integration).
--
-- Purpose: correlate Dilivygo payment attempts <-> provider payment ids <->
-- idempotency keys <-> webhook event ids, so retries, duplicate/out-of-order
-- webhooks, and the payment-reconciliation job can resolve provider truth
-- without guessing. Written best-effort by services/payment-provider.js (the
-- canonical payment capability; the future Keenu provider writes rows with
-- provider='keenu' under the same shape) — ledger writes never fail a payment.
--
-- Lifecycle: insert on create/capture/refund (status = normalized provider
-- state at call time); update to terminal states on webhook receipt
-- (payment_intent.canceled/payment_failed, charge.refunded) or on safe
-- reconciliation repair (internal pending + Stripe canceled -> cancelled).
-- The job auto-repairs ONLY that provably-safe case; every other discrepancy
-- is flagged via structured logs for operator review, never silently fixed.
--
-- Rollout: additive + idempotent (IF NOT EXISTS everywhere). New table, so no
-- backfill (adapter writes going forward; historical intents stay correlated
-- via orders.payment_intent_id / checkout_batches.payment_intent_id).
-- No FK to orders: order_id is NULL for non-order payments (e.g. wallet
-- top-ups keyed by checkout-batch id in dilivygo_reference), and a hard FK
-- would couple deployment ordering. Safe to apply any time; readers tolerate
-- a missing table (reconciliation job degrades to a warn + skip).
-- Do NOT run the migration runner without DB credentials; validate by re-read.

CREATE TABLE IF NOT EXISTS payment_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NULL,
  order_id UUID NULL,
  dilivygo_reference TEXT NULL,
  purpose TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_payment_id TEXT NULL,
  idempotency_key TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT payment_operations_status_check
    CHECK (status IN ('pending', 'requires_action', 'succeeded', 'failed', 'cancelled', 'refunded', 'unknown')),
  raw_status TEXT NULL,
  webhook_event_id TEXT NULL,
  amount_cents INTEGER NULL
    CONSTRAINT payment_operations_amount_cents_check
    CHECK (amount_cents IS NULL OR amount_cents >= 0),
  currency TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: one row per provider idempotency key (partial so NULL keys,
-- e.g. legacy/unkeyed writes, never collide). Retry-safe by construction.
CREATE UNIQUE INDEX IF NOT EXISTS payment_operations_idempotency_key_uq
  ON payment_operations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Webhook/reconciliation lookup: provider truth -> internal rows.
CREATE INDEX IF NOT EXISTS payment_operations_provider_payment_idx
  ON payment_operations (provider, provider_payment_id);

-- Tenant timeline: per-organization operation views ordered by creation.
CREATE INDEX IF NOT EXISTS payment_operations_org_created_idx
  ON payment_operations (organization_id, created_at);

-- Reconciliation scan: unsettled rows by state and age.
CREATE INDEX IF NOT EXISTS payment_operations_status_created_idx
  ON payment_operations (status, created_at);

-- Order drill-down: all attempts for one Dilivygo order.
CREATE INDEX IF NOT EXISTS payment_operations_order_idx
  ON payment_operations (order_id);
