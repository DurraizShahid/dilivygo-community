-- Migration: 102_rider_earnings_recovery
-- Rider delivery-fee earnings are derived financial records. Delivery completion
-- is the canonical source, so the ledger must be exactly-once per delivery and
-- recoverable when an application insert fails after delivery commits.
--
-- Future recovery must replay the fee policy that existed when the delivery was
-- completed, not whatever policy is configured when a worker happens to retry.
-- `rider_delivery_fee_cents` is therefore the immutable rider-net snapshot and
-- `rider_delivery_fee_bps_snapshot` records the policy used to derive it.
--
-- Tips are intentionally outside this migration. The legacy tips flow has no
-- durable payment/capture provenance, so a tip row is not proof money was collected.
-- Existing tip rows and tip earnings are left untouched.
--
-- Historical delivery-fee ledger rows are NEVER deleted. If duplicates already
-- exist, one is linked to the source key while all rows remain for audit/review.

ALTER TABLE rider_earnings
  ADD COLUMN IF NOT EXISTS source_delivery_id UUID REFERENCES deliveries(id) ON DELETE SET NULL;

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS rider_delivery_fee_bps_snapshot INTEGER;

ALTER TABLE deliveries
  DROP CONSTRAINT IF EXISTS deliveries_rider_delivery_fee_bps_snapshot_check;
ALTER TABLE deliveries
  ADD CONSTRAINT deliveries_rider_delivery_fee_bps_snapshot_check
  CHECK (
    rider_delivery_fee_bps_snapshot IS NULL
    OR (rider_delivery_fee_bps_snapshot >= 0 AND rider_delivery_fee_bps_snapshot <= 10000)
  );

-- One canonical legacy ledger row gets the new source key. Additional historical
-- rows are preserved exactly as they are so accounting discrepancies stay visible.
WITH ranked AS (
  SELECT
    id,
    delivery_id,
    row_number() OVER (
      PARTITION BY delivery_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM rider_earnings
  WHERE type = 'delivery_fee'
    AND delivery_id IS NOT NULL
    AND source_delivery_id IS NULL
)
UPDATE rider_earnings re
SET source_delivery_id = ranked.delivery_id
FROM ranked
WHERE re.id = ranked.id
  AND ranked.rn = 1;

CREATE UNIQUE INDEX IF NOT EXISTS rider_earnings_delivery_source_uq
  ON rider_earnings(source_delivery_id)
  WHERE source_delivery_id IS NOT NULL;

-- Snapshot fee policy in the same delivery UPDATE transaction. This trigger runs
-- after the alphabetically earlier delivery/order state invariant trigger, but all
-- BEFORE triggers still share the same transaction and abort together on failure.
CREATE OR REPLACE FUNCTION snapshot_rider_delivery_fee()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_gross_cents INTEGER := 0;
  v_bps INTEGER := 10000;
  v_setting TEXT;
BEGIN
  IF NEW.status = 'delivered'
     AND OLD.status IS DISTINCT FROM 'delivered'
     AND NEW.rider_id IS NOT NULL THEN
    SELECT
      GREATEST(COALESCE(o.delivery_fee_cents, 0), 0),
      ops.value
      INTO v_gross_cents, v_setting
      FROM orders o
      LEFT JOIN organization_platform_settings ops
        ON ops.organization_id = o.organization_id
       AND ops.key = 'rider_delivery_fee_bps'
     WHERE o.id = NEW.order_id
     LIMIT 1;

    IF v_setting IS NOT NULL AND v_setting ~ '^[0-9]+$' THEN
      v_bps := LEAST(10000, GREATEST(0, v_setting::integer));
    END IF;

    NEW.rider_delivery_fee_bps_snapshot := v_bps;
    NEW.rider_delivery_fee_cents := ROUND(v_gross_cents * v_bps / 10000.0)::integer;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_deliveries_snapshot_rider_fee_trg ON deliveries;
CREATE TRIGGER zz_deliveries_snapshot_rider_fee_trg
BEFORE UPDATE OF status ON deliveries
FOR EACH ROW
EXECUTE FUNCTION snapshot_rider_delivery_fee();

-- Older completed deliveries predate the snapshot trigger. Only backfill rows that
-- are actually missing a delivery-fee earning. The current tenant setting is the
-- best recoverable approximation for these legacy anomalies; future rows are exact.
WITH legacy_missing AS (
  SELECT
    d.id AS delivery_id,
    GREATEST(COALESCE(o.delivery_fee_cents, 0), 0) AS gross_cents,
    LEAST(
      10000,
      GREATEST(
        0,
        COALESCE(
          CASE
            WHEN ops.value ~ '^[0-9]+$' THEN ops.value::integer
            ELSE NULL
          END,
          10000
        )
      )
    ) AS bps
  FROM deliveries d
  JOIN orders o ON o.id = d.order_id
  LEFT JOIN organization_platform_settings ops
    ON ops.organization_id = o.organization_id
   AND ops.key = 'rider_delivery_fee_bps'
  WHERE d.status = 'delivered'
    AND d.rider_id IS NOT NULL
    AND d.rider_delivery_fee_bps_snapshot IS NULL
    AND NOT EXISTS (
      SELECT 1
        FROM rider_earnings re
       WHERE re.type = 'delivery_fee'
         AND (re.source_delivery_id = d.id OR re.delivery_id = d.id)
    )
)
UPDATE deliveries d
SET rider_delivery_fee_bps_snapshot = lm.bps,
    rider_delivery_fee_cents = ROUND(lm.gross_cents * lm.bps / 10000.0)::integer
FROM legacy_missing lm
WHERE d.id = lm.delivery_id;

-- Exactly-once ledger insertion. All money is read from the canonical delivery /
-- order snapshot in this transaction; callers cannot authoritatively submit money.
CREATE OR REPLACE FUNCTION record_delivery_fee_earning_once(
  p_id UUID,
  p_rider_id TEXT,
  p_delivery_id UUID
)
RETURNS SETOF rider_earnings
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
  v_project_ref TEXT;
  v_organization_id UUID;
  v_gross_cents INTEGER;
  v_net_cents INTEGER;
  v_platform_fee_cents INTEGER;
  v_bps INTEGER;
BEGIN
  IF p_rider_id IS NULL OR btrim(p_rider_id) = '' THEN
    RAISE EXCEPTION 'rider id is required';
  END IF;
  IF p_delivery_id IS NULL THEN
    RAISE EXCEPTION 'delivery id is required';
  END IF;

  SELECT
    o.id,
    o.project_ref,
    o.organization_id,
    GREATEST(COALESCE(o.delivery_fee_cents, 0), 0),
    GREATEST(COALESCE(d.rider_delivery_fee_cents, 0), 0),
    d.rider_delivery_fee_bps_snapshot
    INTO
      v_order_id,
      v_project_ref,
      v_organization_id,
      v_gross_cents,
      v_net_cents,
      v_bps
    FROM deliveries d
    JOIN orders o ON o.id = d.order_id
   WHERE d.id = p_delivery_id
     AND d.status = 'delivered'
     AND o.status = 'completed'
     AND d.rider_id::text = p_rider_id
     AND o.project_ref IS NOT NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery earning source is not authoritatively completed for rider';
  END IF;
  IF v_bps IS NULL THEN
    RAISE EXCEPTION 'delivery earning source is missing its rider fee policy snapshot';
  END IF;
  IF v_net_cents > v_gross_cents THEN
    RAISE EXCEPTION 'delivery rider fee snapshot exceeds the collected delivery fee';
  END IF;

  v_platform_fee_cents := v_gross_cents - v_net_cents;

  -- Preserve legacy idempotency even if multiple historical rows reference the
  -- same delivery. Never add another row just to populate the new source column.
  RETURN QUERY
    SELECT re.*
      FROM rider_earnings re
     WHERE re.type = 'delivery_fee'
       AND (re.source_delivery_id = p_delivery_id OR re.delivery_id = p_delivery_id)
     ORDER BY (re.source_delivery_id = p_delivery_id) DESC,
              re.created_at ASC NULLS LAST,
              re.id ASC
     LIMIT 1;
  IF FOUND THEN
    RETURN;
  END IF;

  INSERT INTO rider_earnings (
    id,
    rider_id,
    project_ref,
    organization_id,
    order_id,
    delivery_id,
    source_delivery_id,
    type,
    gross_cents,
    platform_fee_cents,
    net_cents,
    created_at
  ) VALUES (
    p_id,
    p_rider_id,
    v_project_ref,
    v_organization_id,
    v_order_id,
    p_delivery_id,
    p_delivery_id,
    'delivery_fee',
    v_gross_cents,
    v_platform_fee_cents,
    v_net_cents,
    NOW()
  )
  ON CONFLICT (source_delivery_id)
    WHERE source_delivery_id IS NOT NULL
  DO NOTHING;

  RETURN QUERY
    SELECT re.*
      FROM rider_earnings re
     WHERE re.source_delivery_id = p_delivery_id
     LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION missing_delivery_fee_earnings(p_limit INTEGER DEFAULT 100)
RETURNS TABLE(
  delivery_id UUID,
  order_id UUID,
  rider_id TEXT,
  project_ref TEXT,
  organization_id UUID,
  delivery_fee_cents INTEGER,
  rider_net_cents INTEGER,
  rider_delivery_fee_bps_snapshot INTEGER
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.id AS delivery_id,
    o.id AS order_id,
    d.rider_id::text AS rider_id,
    o.project_ref,
    o.organization_id,
    GREATEST(COALESCE(o.delivery_fee_cents, 0), 0)::integer AS delivery_fee_cents,
    GREATEST(COALESCE(d.rider_delivery_fee_cents, 0), 0)::integer AS rider_net_cents,
    d.rider_delivery_fee_bps_snapshot
  FROM deliveries d
  JOIN orders o ON o.id = d.order_id
  WHERE d.status = 'delivered'
    AND o.status = 'completed'
    AND d.rider_id IS NOT NULL
    AND d.rider_delivery_fee_bps_snapshot IS NOT NULL
    AND COALESCE(o.delivery_fee_cents, 0) > 0
    AND NOT EXISTS (
      SELECT 1
        FROM rider_earnings re
       WHERE re.type = 'delivery_fee'
         AND (re.source_delivery_id = d.id OR re.delivery_id = d.id)
    )
  ORDER BY o.updated_at ASC NULLS FIRST, d.id ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
$$;
