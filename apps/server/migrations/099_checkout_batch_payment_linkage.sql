-- Migration: 099_checkout_batch_payment_linkage
-- Durable checkout recovery needs to know which payment owns a batch so stale
-- pending rows can be reconciled safely instead of deleted by age alone.

ALTER TABLE checkout_batches
  ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS checkout_batches_payment_intent_uq
  ON checkout_batches(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS checkout_batches_pending_expiry_idx
  ON checkout_batches(status, expires_at)
  WHERE status = 'pending';

-- A checkout handoff may be retried, but it may never be rebound from one
-- financial instrument to another. Lock the row so concurrent response/webhook
-- paths either agree on the same payment id or fail closed.
CREATE OR REPLACE FUNCTION attach_checkout_batch_payment(
  p_batch_id TEXT,
  p_payment_intent_id TEXT
)
RETURNS SETOF checkout_batches
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing TEXT;
BEGIN
  IF p_batch_id IS NULL OR btrim(p_batch_id) = '' THEN
    RAISE EXCEPTION 'checkout batch id is required';
  END IF;
  IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
    RAISE EXCEPTION 'payment intent id is required';
  END IF;

  SELECT payment_intent_id
    INTO v_existing
    FROM checkout_batches
   WHERE id = p_batch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checkout batch not found';
  END IF;

  IF v_existing IS NOT NULL AND v_existing IS DISTINCT FROM p_payment_intent_id THEN
    RAISE EXCEPTION 'checkout batch is already linked to a different payment';
  END IF;

  RETURN QUERY
    UPDATE checkout_batches
       SET payment_intent_id = p_payment_intent_id,
           updated_at = NOW()
     WHERE id = p_batch_id
    RETURNING *;
END;
$$;
