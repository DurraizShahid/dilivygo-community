-- Migration: 064_customer_wallet
-- Customer wallet ledger + atomic apply RPC

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS wallet_balance_cents integer NOT NULL DEFAULT 0
  CHECK (wallet_balance_cents >= 0);

CREATE TABLE IF NOT EXISTS customer_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  project_ref text,
  amount_cents integer NOT NULL,
  type text NOT NULL CHECK (type IN (
    'topup_stripe',
    'admin_credit',
    'admin_debit',
    'refund_credit',
    'checkout_debit',
    'adjustment'
  )),
  reference_type text,
  reference_id uuid,
  idempotency_key text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_wallet_ledger_idempotency_uq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_customer_wallet_ledger_customer
  ON customer_wallet_ledger (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_wallet_ledger_project_ref
  ON customer_wallet_ledger (project_ref);

COMMENT ON TABLE customer_wallet_ledger IS 'Append-only wallet movements; balance on customers.wallet_balance_cents';

-- Atomic credit/debit with row lock. p_amount_cents: positive = credit, negative = debit.
CREATE OR REPLACE FUNCTION customer_wallet_apply(
  p_customer_id uuid,
  p_amount_cents integer,
  p_type text,
  p_idempotency_key text,
  p_project_ref text,
  p_reference_type text,
  p_reference_id uuid,
  p_metadata jsonb
) RETURNS TABLE(new_balance bigint, ledger_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  v_cur integer;
  v_new integer;
  v_ledger_id uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT cwl.id INTO v_ledger_id
    FROM customer_wallet_ledger cwl
    WHERE cwl.idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_ledger_id IS NOT NULL THEN
      SELECT c.wallet_balance_cents INTO v_new FROM customers c WHERE c.id = p_customer_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'customer not found';
      END IF;
      new_balance := v_new::bigint;
      ledger_id := v_ledger_id;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  SELECT c.wallet_balance_cents INTO v_cur FROM customers c WHERE c.id = p_customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer not found';
  END IF;

  v_new := v_cur + p_amount_cents;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'insufficient wallet balance';
  END IF;

  INSERT INTO customer_wallet_ledger (
    customer_id,
    project_ref,
    amount_cents,
    type,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  ) VALUES (
    p_customer_id,
    p_project_ref,
    p_amount_cents,
    p_type,
    p_reference_type,
    p_reference_id,
    NULLIF(trim(p_idempotency_key), ''),
    p_metadata
  )
  RETURNING id INTO v_ledger_id;

  UPDATE customers
  SET wallet_balance_cents = v_new,
      updated_at = now()
  WHERE id = p_customer_id;

  new_balance := v_new::bigint;
  ledger_id := v_ledger_id;
  RETURN NEXT;
END;
$$;
