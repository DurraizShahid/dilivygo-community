-- Migration: 100_durable_refund_operations
-- External refund work spans wallet, Stripe, Connect transfer reversal and the
-- local order row. Every external action is idempotent, but process death still
-- needs a durable instruction telling a later worker what must be resumed.

CREATE TABLE IF NOT EXISTS order_refund_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  requested_amount_cents INTEGER NOT NULL CHECK (requested_amount_cents > 0),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'manual_review')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, requested_amount_cents)
);

CREATE INDEX IF NOT EXISTS order_refund_operations_pending_idx
  ON order_refund_operations(status, updated_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS order_refund_operations_org_idx
  ON order_refund_operations(organization_id, created_at DESC);

-- Ensure/recover one operation per order+amount. The same operation is reused
-- across HTTP retries and background recovery; a different amount remains a
-- distinct request and is still constrained by the order's payment state.
CREATE OR REPLACE FUNCTION ensure_order_refund_operation(
  p_order_id UUID,
  p_amount_cents INTEGER,
  p_reason TEXT DEFAULT NULL
)
RETURNS SETOF order_refund_operations
LANGUAGE plpgsql
AS $$
DECLARE
  v_organization_id UUID;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid refund amount';
  END IF;

  SELECT organization_id
    INTO v_organization_id
    FROM orders
   WHERE id = p_order_id;

  IF NOT FOUND OR v_organization_id IS NULL THEN
    RAISE EXCEPTION 'refund order organization is unavailable';
  END IF;

  RETURN QUERY
    INSERT INTO order_refund_operations (
      order_id,
      organization_id,
      requested_amount_cents,
      reason,
      status,
      created_at,
      updated_at
    ) VALUES (
      p_order_id,
      v_organization_id,
      p_amount_cents,
      p_reason,
      'pending',
      NOW(),
      NOW()
    )
    ON CONFLICT (order_id, requested_amount_cents)
    DO UPDATE SET
      reason = COALESCE(EXCLUDED.reason, order_refund_operations.reason),
      updated_at = NOW()
    RETURNING *;
END;
$$;
