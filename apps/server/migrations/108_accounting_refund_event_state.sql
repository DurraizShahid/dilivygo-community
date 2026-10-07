-- Accounting refunds must use the durable refund-operation ledger introduced in
-- migration 100. A mutable orders.refund_amount_cents value is not an event
-- history and cannot reconstruct separate refund dates after the fact.

ALTER TABLE accounting_source_state
  DROP COLUMN IF EXISTS refund_cumulative_cents,
  DROP COLUMN IF EXISTS refund_posted_at;

CREATE TABLE IF NOT EXISTS accounting_refund_source_state (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  refund_operation_id UUID NOT NULL REFERENCES order_refund_operations(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_record_id UUID REFERENCES accounting_sync_records(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, provider_key, refund_operation_id),
  CONSTRAINT accounting_refund_source_state_provider_check CHECK (provider_key IN ('quickbooks','xero'))
);

CREATE INDEX IF NOT EXISTS accounting_refund_source_state_org_provider_order_idx
  ON accounting_refund_source_state (organization_id, provider_key, order_id, posted_at DESC);

-- Migration 107 introduced the same function signature with a differently named
-- final JSON argument. PostgreSQL does not allow CREATE OR REPLACE FUNCTION to
-- rename an input parameter, so drop the old signature explicitly before
-- installing the event-based finalizer.
DROP FUNCTION IF EXISTS finalize_accounting_sync_record(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB);

-- Replace the 107 finalizer with event-based refund state. The row lock and early
-- return make the function safe to call again after a provider-side idempotent
-- retry: one accounting record can advance source state only once.
CREATE FUNCTION finalize_accounting_sync_record(
  p_record_id UUID,
  p_job_id UUID,
  p_provider_object_type TEXT,
  p_provider_object_id TEXT,
  p_provider_reference TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_sale_order_ids JSONB DEFAULT '[]'::JSONB,
  p_refund_operations JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_org UUID;
  v_provider TEXT;
  v_status TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_item JSONB;
  v_order_id UUID;
  v_operation_id UUID;
  v_amount BIGINT;
BEGIN
  IF jsonb_typeof(COALESCE(p_sale_order_ids, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'sale order ids must be a JSON array';
  END IF;
  IF jsonb_typeof(COALESCE(p_refund_operations, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'refund operations must be a JSON array';
  END IF;

  SELECT organization_id, provider_key, status
    INTO v_org, v_provider, v_status
    FROM accounting_sync_records
   WHERE id = p_record_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accounting sync record % does not exist', p_record_id;
  END IF;

  IF v_status = 'posted' THEN
    RETURN;
  END IF;

  UPDATE accounting_sync_records
     SET job_id = p_job_id,
         provider_object_type = p_provider_object_type,
         provider_object_id = p_provider_object_id,
         provider_reference = p_provider_reference,
         status = 'posted',
         metadata = COALESCE(p_metadata, '{}'::JSONB),
         last_error = NULL,
         posted_at = v_now,
         updated_at = v_now
   WHERE id = p_record_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_sale_order_ids, '[]'::JSONB))
  LOOP
    v_order_id := NULLIF(BTRIM(v_item #>> '{}'), '')::UUID;
    IF v_order_id IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM orders o
       WHERE o.id = v_order_id
         AND o.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'sale source order % is outside accounting organization %', v_order_id, v_org;
    END IF;

    INSERT INTO accounting_source_state (
      organization_id, provider_key, order_id,
      sale_posted, sale_posted_at, last_record_id,
      created_at, updated_at
    ) VALUES (
      v_org, v_provider, v_order_id,
      TRUE, v_now, p_record_id,
      v_now, v_now
    )
    ON CONFLICT (organization_id, provider_key, order_id)
    DO UPDATE SET
      sale_posted = TRUE,
      sale_posted_at = COALESCE(accounting_source_state.sale_posted_at, EXCLUDED.sale_posted_at),
      last_record_id = EXCLUDED.last_record_id,
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_refund_operations, '[]'::JSONB))
  LOOP
    v_operation_id := NULLIF(BTRIM(v_item->>'operationId'), '')::UUID;
    v_order_id := NULLIF(BTRIM(v_item->>'orderId'), '')::UUID;
    v_amount := GREATEST(0, COALESCE((v_item->>'amountCents')::BIGINT, 0));

    IF v_operation_id IS NULL OR v_order_id IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'invalid accounting refund operation source';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM order_refund_operations r
       WHERE r.id = v_operation_id
         AND r.order_id = v_order_id
         AND r.organization_id = v_org
         AND r.status = 'completed'
         AND r.requested_amount_cents = v_amount
    ) THEN
      RAISE EXCEPTION 'refund operation % is not a completed source for accounting organization %', v_operation_id, v_org;
    END IF;

    INSERT INTO accounting_refund_source_state (
      organization_id, provider_key, refund_operation_id,
      order_id, amount_cents, posted_at, last_record_id,
      created_at, updated_at
    ) VALUES (
      v_org, v_provider, v_operation_id,
      v_order_id, v_amount, v_now, p_record_id,
      v_now, v_now
    )
    ON CONFLICT (organization_id, provider_key, refund_operation_id)
    DO UPDATE SET
      last_record_id = EXCLUDED.last_record_id,
      updated_at = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

-- This RPC finalizes provider-side financial writes and must never be callable by
-- browser/client roles. The server uses the Supabase service role for this call.
REVOKE ALL ON FUNCTION finalize_accounting_sync_record(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION finalize_accounting_sync_record(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION finalize_accounting_sync_record(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) TO service_role;
