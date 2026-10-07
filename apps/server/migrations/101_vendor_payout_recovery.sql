-- Migration: 101_vendor_payout_recovery
-- vendor_payment_transfers is already unique per PaymentIntent + workspace. Turn
-- that table into the durable payout work queue itself: snapshot all payout
-- parameters before any Stripe transfer call, then retry pending/failed rows.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS vendor_payout_snapshot_at TIMESTAMPTZ;

ALTER TABLE vendor_payment_transfers
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS destination_account_id TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE vendor_payment_transfers
  DROP CONSTRAINT IF EXISTS vendor_payment_transfers_status_check;
ALTER TABLE vendor_payment_transfers
  ADD CONSTRAINT vendor_payment_transfers_status_check
  CHECK (status IN ('pending', 'completed', 'failed', 'skipped', 'manual_review'));

CREATE INDEX IF NOT EXISTS vendor_payment_transfers_recovery_idx
  ON vendor_payment_transfers(status, updated_at)
  WHERE status IN ('pending', 'failed');

-- Existing transfer rows prove the payout split was previously materialized.
UPDATE orders o
SET vendor_payout_snapshot_at = COALESCE(o.vendor_payout_snapshot_at, o.updated_at, o.created_at, NOW())
WHERE o.vendor_payout_snapshot_at IS NULL
  AND (
    o.vendor_stripe_transfer_id IS NOT NULL
    OR o.platform_commission_cents <> 0
    OR o.vendor_payout_cents <> 0
    OR EXISTS (
      SELECT 1
      FROM vendor_payment_transfers v
      WHERE v.payment_intent_id = o.payment_intent_id
        AND v.project_ref = o.project_ref
    )
  );

-- Recover useful durable parameters for historical transfer rows where possible.
UPDATE vendor_payment_transfers v
SET currency = COALESCE(
      v.currency,
      (
        SELECT lower(COALESCE(o.currency, 'gbp'))
        FROM orders o
        WHERE o.payment_intent_id = v.payment_intent_id
          AND o.project_ref = v.project_ref
        ORDER BY o.created_at ASC
        LIMIT 1
      ),
      'gbp'
    ),
    destination_account_id = COALESCE(
      v.destination_account_id,
      (
        SELECT w.stripe_connect_account_id
        FROM workspaces w
        WHERE w.project_ref = v.project_ref
        LIMIT 1
      )
    )
WHERE v.currency IS NULL OR v.destination_account_id IS NULL;

-- These old "skips" were not terminal business decisions. Wallet orders still
-- owe the restaurant money, and incomplete Connect onboarding should be retried
-- when the account becomes ready.
UPDATE vendor_payment_transfers
SET status = 'pending',
    updated_at = NOW()
WHERE status = 'skipped'
  AND error_message IN ('wallet_checkout', 'no_connect_account', 'connect_payouts_not_ready');

-- Atomically snapshot order commission/payout values and materialize one durable
-- transfer work row per workspace before any external Stripe transfer occurs.
CREATE OR REPLACE FUNCTION prepare_vendor_payout_work(
  p_payment_intent_id TEXT,
  p_currency TEXT,
  p_order_splits JSONB,
  p_transfer_splits JSONB
)
RETURNS SETOF vendor_payment_transfers
LANGUAGE plpgsql
AS $$
DECLARE
  v_item JSONB;
  v_order_id UUID;
  v_project_ref TEXT;
  v_amount INTEGER;
  v_status TEXT;
  v_destination TEXT;
  v_error TEXT;
BEGIN
  IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
    RAISE EXCEPTION 'payment intent id is required';
  END IF;
  IF jsonb_typeof(COALESCE(p_order_splits, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'order splits must be an array';
  END IF;
  IF jsonb_typeof(COALESCE(p_transfer_splits, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'transfer splits must be an array';
  END IF;

  -- Lock the payment's order set so two webhook/worker attempts cannot snapshot
  -- different commission policy at the same time.
  PERFORM 1
  FROM orders
  WHERE payment_intent_id = p_payment_intent_id
  FOR UPDATE;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_order_splits, '[]'::jsonb)) LOOP
    v_order_id := (v_item->>'orderId')::uuid;

    IF NOT EXISTS (
      SELECT 1 FROM orders
      WHERE id = v_order_id AND payment_intent_id = p_payment_intent_id
    ) THEN
      RAISE EXCEPTION 'payout split order % does not belong to payment %', v_order_id, p_payment_intent_id;
    END IF;

    UPDATE orders
       SET platform_commission_cents = GREATEST(0, COALESCE((v_item->>'platformCommissionCents')::integer, 0)),
           vendor_payout_cents = GREATEST(0, COALESCE((v_item->>'vendorPayoutCents')::integer, 0)),
           vendor_payout_snapshot_at = NOW(),
           updated_at = NOW()
     WHERE id = v_order_id
       AND payment_intent_id = p_payment_intent_id
       AND vendor_payout_snapshot_at IS NULL;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_transfer_splits, '[]'::jsonb)) LOOP
    v_project_ref := NULLIF(btrim(v_item->>'projectRef'), '');
    v_amount := GREATEST(0, COALESCE((v_item->>'amountCents')::integer, 0));
    v_status := COALESCE(NULLIF(v_item->>'status', ''), 'pending');
    v_destination := NULLIF(btrim(v_item->>'destinationAccountId'), '');
    v_error := NULLIF(v_item->>'errorMessage', '');

    IF v_project_ref IS NULL THEN
      RAISE EXCEPTION 'vendor payout project_ref is required';
    END IF;
    IF v_status NOT IN ('pending', 'skipped') THEN
      RAISE EXCEPTION 'invalid initial vendor payout status %', v_status;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM orders
      WHERE payment_intent_id = p_payment_intent_id
        AND project_ref = v_project_ref
    ) THEN
      RAISE EXCEPTION 'vendor payout workspace % is not part of payment %', v_project_ref, p_payment_intent_id;
    END IF;

    INSERT INTO vendor_payment_transfers (
      payment_intent_id,
      project_ref,
      amount_cents,
      currency,
      destination_account_id,
      status,
      error_message,
      created_at,
      updated_at
    ) VALUES (
      p_payment_intent_id,
      v_project_ref,
      v_amount,
      lower(COALESCE(NULLIF(p_currency, ''), 'gbp')),
      v_destination,
      v_status,
      v_error,
      NOW(),
      NOW()
    )
    ON CONFLICT (payment_intent_id, project_ref)
    DO UPDATE SET
      currency = COALESCE(vendor_payment_transfers.currency, EXCLUDED.currency),
      destination_account_id = COALESCE(vendor_payment_transfers.destination_account_id, EXCLUDED.destination_account_id),
      error_message = CASE
        WHEN vendor_payment_transfers.status IN ('completed', 'skipped', 'manual_review')
          THEN vendor_payment_transfers.error_message
        ELSE COALESCE(EXCLUDED.error_message, vendor_payment_transfers.error_message)
      END,
      updated_at = NOW();
  END LOOP;

  RETURN QUERY
    SELECT *
    FROM vendor_payment_transfers
    WHERE payment_intent_id = p_payment_intent_id
    ORDER BY project_ref ASC;
END;
$$;

-- Discover both explicit failed/pending work and paid order groups for which a
-- transfer row was never materialized (for example a process crash during the
-- initial payout preparation).
CREATE OR REPLACE FUNCTION vendor_payout_recovery_candidates(p_limit INTEGER DEFAULT 100)
RETURNS TABLE(payment_intent_id TEXT, currency TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    o.payment_intent_id,
    lower(COALESCE(MIN(o.currency), 'gbp')) AS currency
  FROM orders o
  WHERE o.payment_intent_id IS NOT NULL
    AND o.payment_intent_id <> ''
    AND o.payment_intent_id NOT LIKE 'pi_dummy%'
    AND o.pos_checkout_mode IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM vendor_payment_transfers v
        WHERE v.payment_intent_id = o.payment_intent_id
          AND v.status IN ('pending', 'failed')
      )
      OR (
        o.payment_status = 'paid'
        AND NOT EXISTS (
          SELECT 1
          FROM vendor_payment_transfers v
          WHERE v.payment_intent_id = o.payment_intent_id
            AND v.project_ref = o.project_ref
        )
      )
    )
  GROUP BY o.payment_intent_id
  ORDER BY MIN(o.created_at) ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
$$;
