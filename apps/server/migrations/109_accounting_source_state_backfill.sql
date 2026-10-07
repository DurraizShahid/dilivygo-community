-- Backfill compact source state from accounting records created by an earlier
-- revision of this branch. This makes the 107/108 state model safe to deploy on
-- an environment that already posted accounting objects before source-state
-- finalization became atomic.

-- ─── Per-order sales ──────────────────────────────────────────────────────────
INSERT INTO accounting_source_state (
  organization_id, provider_key, order_id,
  sale_posted, sale_posted_at, last_record_id,
  created_at, updated_at
)
SELECT
  r.organization_id,
  r.provider_key,
  o.id,
  TRUE,
  COALESCE(r.posted_at, r.updated_at, r.created_at, NOW()),
  r.id,
  NOW(),
  NOW()
FROM accounting_sync_records r
JOIN orders o
  ON o.organization_id = r.organization_id
 AND o.id::text = COALESCE(NULLIF(r.metadata->>'orderId', ''), r.source_id)
WHERE r.status = 'posted'
  AND r.source_type = 'sale'
ON CONFLICT (organization_id, provider_key, order_id)
DO UPDATE SET
  sale_posted = TRUE,
  sale_posted_at = COALESCE(accounting_source_state.sale_posted_at, EXCLUDED.sale_posted_at),
  last_record_id = EXCLUDED.last_record_id,
  updated_at = NOW();

-- ─── Daily-summary sales ──────────────────────────────────────────────────────
INSERT INTO accounting_source_state (
  organization_id, provider_key, order_id,
  sale_posted, sale_posted_at, last_record_id,
  created_at, updated_at
)
SELECT DISTINCT
  r.organization_id,
  r.provider_key,
  o.id,
  TRUE,
  COALESCE(r.posted_at, r.updated_at, r.created_at, NOW()),
  r.id,
  NOW(),
  NOW()
FROM accounting_sync_records r
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(r.metadata->'orderIds') = 'array' THEN r.metadata->'orderIds'
    ELSE '[]'::jsonb
  END
) AS source_order(order_id)
JOIN orders o
  ON o.organization_id = r.organization_id
 AND o.id::text = source_order.order_id
WHERE r.status = 'posted'
  AND r.source_type = 'daily_sales'
ON CONFLICT (organization_id, provider_key, order_id)
DO UPDATE SET
  sale_posted = TRUE,
  sale_posted_at = COALESCE(accounting_source_state.sale_posted_at, EXCLUDED.sale_posted_at),
  last_record_id = EXCLUDED.last_record_id,
  updated_at = NOW();

-- ─── Per-refund-operation records created by the new event model ──────────────
INSERT INTO accounting_refund_source_state (
  organization_id, provider_key, refund_operation_id,
  order_id, amount_cents, posted_at, last_record_id,
  created_at, updated_at
)
SELECT
  r.organization_id,
  r.provider_key,
  op.id,
  op.order_id,
  op.requested_amount_cents,
  COALESCE(r.posted_at, r.updated_at, r.created_at, NOW()),
  r.id,
  NOW(),
  NOW()
FROM accounting_sync_records r
JOIN order_refund_operations op
  ON op.organization_id = r.organization_id
 AND op.status = 'completed'
 AND op.id::text = NULLIF(r.metadata->>'refundOperationId', '')
WHERE r.status = 'posted'
  AND r.source_type = 'refund'
ON CONFLICT (organization_id, provider_key, refund_operation_id)
DO UPDATE SET
  last_record_id = EXCLUDED.last_record_id,
  updated_at = NOW();

-- ─── Legacy per-order refund records ──────────────────────────────────────────
-- Earlier branch revisions identified refunds by order+cumulative amount. The
-- durable refund operation uses the same requested amount and gives us the real
-- event identity/timestamp. Fall back to record amount only when old metadata
-- did not carry cumulativeRefundCents.
INSERT INTO accounting_refund_source_state (
  organization_id, provider_key, refund_operation_id,
  order_id, amount_cents, posted_at, last_record_id,
  created_at, updated_at
)
SELECT DISTINCT
  r.organization_id,
  r.provider_key,
  op.id,
  op.order_id,
  op.requested_amount_cents,
  COALESCE(r.posted_at, r.updated_at, r.created_at, NOW()),
  r.id,
  NOW(),
  NOW()
FROM accounting_sync_records r
JOIN order_refund_operations op
  ON op.organization_id = r.organization_id
 AND op.status = 'completed'
 AND op.order_id::text = COALESCE(NULLIF(r.metadata->>'orderId', ''), r.source_id)
 AND op.requested_amount_cents = COALESCE(
   NULLIF(r.metadata->>'cumulativeRefundCents', '')::integer,
   r.amount_cents::integer
 )
WHERE r.status = 'posted'
  AND r.source_type = 'refund'
  AND NULLIF(r.metadata->>'refundOperationId', '') IS NULL
ON CONFLICT (organization_id, provider_key, refund_operation_id)
DO UPDATE SET
  last_record_id = EXCLUDED.last_record_id,
  updated_at = NOW();

-- ─── New daily refund-operation batches ──────────────────────────────────────
INSERT INTO accounting_refund_source_state (
  organization_id, provider_key, refund_operation_id,
  order_id, amount_cents, posted_at, last_record_id,
  created_at, updated_at
)
SELECT DISTINCT
  r.organization_id,
  r.provider_key,
  op.id,
  op.order_id,
  op.requested_amount_cents,
  COALESCE(r.posted_at, r.updated_at, r.created_at, NOW()),
  r.id,
  NOW(),
  NOW()
FROM accounting_sync_records r
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(r.metadata->'refundOperations') = 'array' THEN r.metadata->'refundOperations'
    ELSE '[]'::jsonb
  END
) AS refund_source(item)
JOIN order_refund_operations op
  ON op.organization_id = r.organization_id
 AND op.status = 'completed'
 AND op.id::text = refund_source.item->>'operationId'
 AND op.order_id::text = refund_source.item->>'orderId'
 AND op.requested_amount_cents = (refund_source.item->>'amountCents')::integer
WHERE r.status = 'posted'
  AND r.source_type = 'daily_refunds'
ON CONFLICT (organization_id, provider_key, refund_operation_id)
DO UPDATE SET
  last_record_id = EXCLUDED.last_record_id,
  updated_at = NOW();

-- ─── Legacy daily refund snapshots ────────────────────────────────────────────
INSERT INTO accounting_refund_source_state (
  organization_id, provider_key, refund_operation_id,
  order_id, amount_cents, posted_at, last_record_id,
  created_at, updated_at
)
SELECT DISTINCT
  r.organization_id,
  r.provider_key,
  op.id,
  op.order_id,
  op.requested_amount_cents,
  COALESCE(r.posted_at, r.updated_at, r.created_at, NOW()),
  r.id,
  NOW(),
  NOW()
FROM accounting_sync_records r
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(r.metadata->'refundSnapshot') = 'array' THEN r.metadata->'refundSnapshot'
    ELSE '[]'::jsonb
  END
) AS refund_source(item)
JOIN order_refund_operations op
  ON op.organization_id = r.organization_id
 AND op.status = 'completed'
 AND op.order_id::text = refund_source.item->>'orderId'
 AND op.requested_amount_cents = COALESCE(
   NULLIF(refund_source.item->>'cumulativeRefundCents', '')::integer,
   NULLIF(refund_source.item->>'deltaRefundCents', '')::integer
 )
WHERE r.status = 'posted'
  AND r.source_type = 'daily_refunds'
  AND jsonb_typeof(r.metadata->'refundOperations') IS DISTINCT FROM 'array'
ON CONFLICT (organization_id, provider_key, refund_operation_id)
DO UPDATE SET
  last_record_id = EXCLUDED.last_record_id,
  updated_at = NOW();
