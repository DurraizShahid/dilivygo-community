-- Canonical merchant accounting needs independent provenance for the revenue and
-- Dilivygo-commission components of a Connect-snapshotted order. A revenue write
-- may succeed while a fee write fails, so one boolean cannot safely cover both.

ALTER TABLE accounting_source_state
  ADD COLUMN IF NOT EXISTS fee_posted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fee_posted_at TIMESTAMPTZ;

ALTER TABLE accounting_sync_records
  DROP CONSTRAINT IF EXISTS accounting_sync_records_source_check;
ALTER TABLE accounting_sync_records
  ADD CONSTRAINT accounting_sync_records_source_check CHECK (
    source_type IN (
      'sale',
      'refund',
      'daily_sales',
      'daily_refunds',
      'platform_fee',
      'daily_platform_fees',
      'payout',
      'payout_reversal'
    )
  );

-- Replace the 8-argument finalizer with a 9-argument version that can advance
-- commission provenance independently from sale provenance. Drop first to avoid
-- PostgREST overload ambiguity for the same RPC name.
DROP FUNCTION IF EXISTS finalize_accounting_sync_record(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB);

CREATE FUNCTION finalize_accounting_sync_record(
  p_record_id UUID,
  p_job_id UUID,
  p_provider_object_type TEXT,
  p_provider_object_id TEXT,
  p_provider_reference TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_sale_order_ids JSONB DEFAULT '[]'::JSONB,
  p_fee_order_ids JSONB DEFAULT '[]'::JSONB,
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
  IF jsonb_typeof(COALESCE(p_fee_order_ids, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'fee order ids must be a JSON array';
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
    IF v_order_id IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM orders o
       WHERE o.id = v_order_id
         AND o.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'sale source order % is outside accounting organization %', v_order_id, v_org;
    END IF;

    INSERT INTO accounting_source_state (
      organization_id, provider_key, order_id,
      sale_posted, sale_posted_at, fee_posted, fee_posted_at,
      last_record_id, created_at, updated_at
    ) VALUES (
      v_org, v_provider, v_order_id,
      TRUE, v_now, FALSE, NULL,
      p_record_id, v_now, v_now
    )
    ON CONFLICT (organization_id, provider_key, order_id)
    DO UPDATE SET
      sale_posted = TRUE,
      sale_posted_at = COALESCE(accounting_source_state.sale_posted_at, EXCLUDED.sale_posted_at),
      last_record_id = EXCLUDED.last_record_id,
      updated_at = EXCLUDED.updated_at;
  END LOOP;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_fee_order_ids, '[]'::JSONB))
  LOOP
    v_order_id := NULLIF(BTRIM(v_item #>> '{}'), '')::UUID;
    IF v_order_id IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM orders o
       WHERE o.id = v_order_id
         AND o.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'fee source order % is outside accounting organization %', v_order_id, v_org;
    END IF;

    INSERT INTO accounting_source_state (
      organization_id, provider_key, order_id,
      sale_posted, sale_posted_at, fee_posted, fee_posted_at,
      last_record_id, created_at, updated_at
    ) VALUES (
      v_org, v_provider, v_order_id,
      FALSE, NULL, TRUE, v_now,
      p_record_id, v_now, v_now
    )
    ON CONFLICT (organization_id, provider_key, order_id)
    DO UPDATE SET
      fee_posted = TRUE,
      fee_posted_at = COALESCE(accounting_source_state.fee_posted_at, EXCLUDED.fee_posted_at),
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

REVOKE ALL ON FUNCTION finalize_accounting_sync_record(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION finalize_accounting_sync_record(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION finalize_accounting_sync_record(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB, JSONB) TO service_role;

-- Backfill commission provenance for already-posted per-order fee records created
-- by an earlier revision of this branch. Daily fee records did not exist before
-- this migration, so there is no historical daily-fee provenance to reconstruct.
UPDATE accounting_source_state s
SET fee_posted = TRUE,
    fee_posted_at = COALESCE(s.fee_posted_at, r.posted_at, r.updated_at, NOW()),
    last_record_id = COALESCE(r.id, s.last_record_id),
    updated_at = NOW()
FROM accounting_sync_records r
WHERE r.organization_id = s.organization_id
  AND r.provider_key = s.provider_key
  AND r.status = 'posted'
  AND r.source_type = 'platform_fee'
  AND r.source_id = s.order_id::TEXT;
