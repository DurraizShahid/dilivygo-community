-- Migration: 088_security_financial_invariants
-- Durable checkout handoff + database-enforced idempotency/concurrency guards.

-- ── Durable checkout batches ─────────────────────────────────────────────────
-- Stripe can retry webhooks well after an in-memory/Redis checkout handoff is
-- gone. Keep the validated checkout payload in Postgres until fulfillment has
-- completed; expiration is for cleanup, not correctness during processing.
CREATE TABLE IF NOT EXISTS checkout_batches (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS checkout_batches_status_idx ON checkout_batches(status);
CREATE INDEX IF NOT EXISTS checkout_batches_expires_at_idx ON checkout_batches(expires_at);

-- ── Stripe event ledger is a SUCCESS ledger ─────────────────────────────────
ALTER TABLE stripe_events
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- One Stripe PaymentIntent may produce multiple orders only when they are for
-- different shops (multi-shop checkout). This makes webhook retries unable to
-- duplicate an already-created shop order.
CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_intent_shop_uq
  ON orders(payment_intent_id, shop_id)
  WHERE payment_intent_id IS NOT NULL AND shop_id IS NOT NULL;

-- A promo can be redeemed at most once against the same order.
CREATE UNIQUE INDEX IF NOT EXISTS promo_redemptions_order_promo_uq
  ON promo_redemptions(order_id, promo_code_id);

-- Earnings are financial ledger rows. The application already attempts these
-- idempotency checks; make them race-safe at the database layer too.
CREATE UNIQUE INDEX IF NOT EXISTS rider_earnings_delivery_type_uq
  ON rider_earnings(delivery_id, type)
  WHERE delivery_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS rider_earnings_order_type_uq
  ON rider_earnings(order_id, type)
  WHERE order_id IS NOT NULL;

-- ── Compare-and-set state transitions ────────────────────────────────────────
-- Callers pass the state they previously observed. A concurrent transition
-- returns no row instead of overwriting newer state.
CREATE OR REPLACE FUNCTION compare_and_set_order_status(
  p_order_id UUID,
  p_expected_status TEXT,
  p_new_status TEXT
)
RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    UPDATE orders
       SET status = p_new_status,
           updated_at = NOW()
     WHERE id = p_order_id
       AND status = p_expected_status
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION compare_and_set_delivery_status(
  p_delivery_id UUID,
  p_expected_status TEXT,
  p_new_status TEXT
)
RETURNS SETOF deliveries
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    UPDATE deliveries
       SET status = p_new_status,
           updated_at = NOW()
     WHERE id = p_delivery_id
       AND status = p_expected_status
    RETURNING *;
END;
$$;

-- ── Atomic rider payout reservation ──────────────────────────────────────────
-- Balance calculation and payout creation are one transaction under a per-rider
-- advisory lock, so two simultaneous payout requests cannot both spend the same
-- available balance.
CREATE OR REPLACE FUNCTION rider_request_payout(
  p_id UUID,
  p_rider_id TEXT,
  p_project_ref TEXT,
  p_amount_cents INTEGER,
  p_payout_method TEXT DEFAULT 'manual',
  p_note TEXT DEFAULT NULL
)
RETURNS SETOF rider_payouts
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_net BIGINT;
  v_reserved BIGINT;
  v_available BIGINT;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid payout amount';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_rider_id, 0));

  SELECT COALESCE(SUM(net_cents), 0)
    INTO v_total_net
    FROM rider_earnings
   WHERE rider_id = p_rider_id;

  SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_reserved
    FROM rider_payouts
   WHERE rider_id = p_rider_id
     AND status IN ('pending', 'approved', 'processing', 'completed');

  v_available := GREATEST(0, v_total_net - v_reserved);
  IF p_amount_cents > v_available THEN
    RAISE EXCEPTION 'insufficient rider payout balance';
  END IF;

  RETURN QUERY
    INSERT INTO rider_payouts (
      id, rider_id, project_ref, amount_cents, status,
      payout_method, note, created_at, updated_at
    ) VALUES (
      p_id, p_rider_id, p_project_ref, p_amount_cents, 'pending',
      COALESCE(p_payout_method, 'manual'), p_note, NOW(), NOW()
    )
    RETURNING *;
END;
$$;
