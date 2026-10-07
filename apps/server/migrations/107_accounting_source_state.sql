-- Incremental accounting source state.
--
-- The accounting ledger in 105 is an audit/retry ledger. This migration adds a
-- compact per-order state table so automatic synchronization does not have to
-- rescan all historical accounting records on every run. It also gives orders a
-- stable completion timestamp so revenue is grouped by the day the order
-- actually completed, not the day it happened to be created or last edited.

-- ─── Stable order completion timestamp ───────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE orders
SET completed_at = COALESCE(completed_at, updated_at, created_at)
WHERE status = 'completed'
  AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS orders_org_completed_at_idx
  ON orders (organization_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION set_order_completed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.completed_at := COALESCE(NEW.created_at, NOW());
    ELSIF OLD.status IS DISTINCT FROM 'completed' THEN
      NEW.completed_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_completed_at_trg ON orders;
CREATE TRIGGER orders_set_completed_at_trg
BEFORE INSERT OR UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION set_order_completed_at();

-- ─── Correct fee terminology before this accounting contract ships ──────────
-- 105 used "processor_fee" as an internal source name, but the amount available
-- in Dilivygo is the snapshotted platform commission. Stripe processor/balance
-- transaction fees are not currently imported, so do not label them as such.
UPDATE accounting_sync_records
SET source_type = 'platform_fee'
WHERE source_type = 'processor_fee';

ALTER TABLE accounting_sync_records
  DROP CONSTRAINT IF EXISTS accounting_sync_records_source_check;
ALTER TABLE accounting_sync_records
  ADD CONSTRAINT accounting_sync_records_source_check
  CHECK (source_type IN ('sale','refund','daily_sales','daily_refunds','payout','platform_fee'));

-- ─── Compact source state ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting_source_state (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sale_posted BOOLEAN NOT NULL DEFAULT FALSE,
  sale_posted_at TIMESTAMPTZ,
  refund_cumulative_cents BIGINT NOT NULL DEFAULT 0,
  refund_posted_at TIMESTAMPTZ,
  last_record_id UUID REFERENCES accounting_sync_records(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, provider_key, order_id),
  CONSTRAINT accounting_source_state_provider_check CHECK (provider_key IN ('quickbooks','xero')),
  CONSTRAINT accounting_source_state_refund_nonnegative CHECK (refund_cumulative_cents >= 0)
);

CREATE INDEX IF NOT EXISTS accounting_source_state_org_provider_updated_idx
  ON accounting_source_state (organization_id, provider_key, updated_at DESC);

-- Atomically mark an accounting provider write as posted and advance the compact
-- source state represented by that provider object. If this transaction fails,
-- the record remains pending/failed and the next retry uses the same provider
-- idempotency identity instead of silently advancing the source cursor.
CREATE OR REPLACE FUNCTION finalize_accounting_sync_record(
  p_record_id UUID,
  p_job_id UUID,
  p_provider_object_type TEXT,
  p_provider_object_id TEXT,
  p_provider_reference TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_sale_order_ids JSONB DEFAULT '[]'::JSONB,
  p_refund_snapshot JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_org UUID;
  v_provider TEXT;
  v_now TIMESTAMPTZ := NOW();
  v_item JSONB;
  v_order_id UUID;
  v_cumulative BIGINT;
BEGIN
  IF jsonb_typeof(COALESCE(p_sale_order_ids, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'sale order ids must be a JSON array';
  END IF;
  IF jsonb_typeof(COALESCE(p_refund_snapshot, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'refund snapshot must be a JSON array';
  END IF;

  SELECT organization_id, provider_key
    INTO v_org, v_provider
    FROM accounting_sync_records
   WHERE id = p_record_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accounting sync record % does not exist', p_record_id;
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
    SELECT value FROM jsonb_array_elements(COALESCE(p_refund_snapshot, '[]'::JSONB))
  LOOP
    v_order_id := NULLIF(BTRIM(v_item->>'orderId'), '')::UUID;
    v_cumulative := GREATEST(0, COALESCE((v_item->>'cumulativeRefundCents')::BIGINT, 0));
    IF v_order_id IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM orders o
       WHERE o.id = v_order_id
         AND o.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'refund source order % is outside accounting organization %', v_order_id, v_org;
    END IF;

    INSERT INTO accounting_source_state (
      organization_id, provider_key, order_id,
      refund_cumulative_cents, refund_posted_at, last_record_id,
      created_at, updated_at
    ) VALUES (
      v_org, v_provider, v_order_id,
      v_cumulative, v_now, p_record_id,
      v_now, v_now
    )
    ON CONFLICT (organization_id, provider_key, order_id)
    DO UPDATE SET
      refund_cumulative_cents = GREATEST(accounting_source_state.refund_cumulative_cents, EXCLUDED.refund_cumulative_cents),
      refund_posted_at = CASE
        WHEN EXCLUDED.refund_cumulative_cents > accounting_source_state.refund_cumulative_cents THEN EXCLUDED.refund_posted_at
        ELSE accounting_source_state.refund_posted_at
      END,
      last_record_id = EXCLUDED.last_record_id,
      updated_at = EXCLUDED.updated_at;
  END LOOP;
END;
$$;
