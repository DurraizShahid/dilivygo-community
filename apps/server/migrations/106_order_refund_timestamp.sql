-- Accounting needs a stable refund occurrence timestamp. `updated_at` is not
-- sufficient because unrelated order edits would move a historical refund into
-- a different daily accounting period.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

UPDATE orders
SET refunded_at = COALESCE(refunded_at, updated_at, created_at)
WHERE refunded_at IS NULL
  AND refund_amount_cents IS NOT NULL
  AND refund_amount_cents > 0;

CREATE INDEX IF NOT EXISTS orders_org_refunded_at_idx
  ON orders (organization_id, refunded_at DESC)
  WHERE refunded_at IS NOT NULL;
