-- Migration: 092_inventory_reservations
-- Reserve finite variant stock before payment so concurrent checkouts cannot both
-- pass a read-only stock check. Reservations are linked to the PaymentIntent,
-- consumed by order fulfillment, or explicitly released after payment expiry.

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id TEXT PRIMARY KEY,
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'consumed', 'released')),
  payment_intent_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS inventory_reservations_status_expiry_idx
  ON inventory_reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS inventory_reservations_payment_intent_idx
  ON inventory_reservations(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS inventory_reservation_id TEXT
  REFERENCES inventory_reservations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_inventory_reservation_idx
  ON orders(inventory_reservation_id)
  WHERE inventory_reservation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reserve_checkout_inventory(
  p_reservation_id TEXT,
  p_items JSONB,
  p_ttl_minutes INTEGER DEFAULT 30
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_item JSONB;
  v_variant_id UUID;
  v_qty INTEGER;
  v_updated INTEGER;
BEGIN
  IF p_reservation_id IS NULL OR btrim(p_reservation_id) = '' THEN
    RAISE EXCEPTION 'reservation id is required';
  END IF;

  IF EXISTS (SELECT 1 FROM inventory_reservations WHERE id = p_reservation_id) THEN
    RETURN p_reservation_id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB))
  LOOP
    v_variant_id := NULLIF(v_item->>'variantId', '')::UUID;
    v_qty := GREATEST(0, COALESCE((v_item->>'quantity')::INTEGER, 0));
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE product_variants
       SET stock_quantity = CASE
             WHEN stock_quantity IS NULL THEN NULL
             ELSE stock_quantity - v_qty
           END,
           updated_at = NOW()
     WHERE id = v_variant_id
       AND available = TRUE
       AND (stock_quantity IS NULL OR stock_quantity >= v_qty);
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      RAISE EXCEPTION 'insufficient or unavailable stock for variant %', v_variant_id;
    END IF;
  END LOOP;

  INSERT INTO inventory_reservations (
    id, items, status, expires_at, created_at, updated_at
  ) VALUES (
    p_reservation_id,
    COALESCE(p_items, '[]'::JSONB),
    'reserved',
    NOW() + make_interval(mins => GREATEST(5, LEAST(COALESCE(p_ttl_minutes, 30), 120))),
    NOW(),
    NOW()
  );

  RETURN p_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION attach_inventory_reservation_payment(
  p_reservation_id TEXT,
  p_payment_intent_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE inventory_reservations
     SET payment_intent_id = p_payment_intent_id,
         updated_at = NOW()
   WHERE id = p_reservation_id
     AND status = 'reserved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory reservation is not active';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION consume_inventory_reservation(
  p_reservation_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF p_reservation_id IS NULL OR btrim(p_reservation_id) = '' THEN
    RETURN;
  END IF;

  SELECT status INTO v_status
    FROM inventory_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory reservation not found';
  END IF;
  IF v_status = 'released' THEN
    RAISE EXCEPTION 'inventory reservation expired or was released';
  END IF;
  IF v_status = 'consumed' THEN
    RETURN;
  END IF;

  UPDATE inventory_reservations
     SET status = 'consumed',
         consumed_at = NOW(),
         updated_at = NOW()
   WHERE id = p_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION release_inventory_reservation(
  p_reservation_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_row inventory_reservations%ROWTYPE;
  v_item JSONB;
  v_variant_id UUID;
  v_qty INTEGER;
BEGIN
  SELECT * INTO v_row
    FROM inventory_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND OR v_row.status <> 'reserved' THEN
    RETURN;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(v_row.items, '[]'::JSONB))
  LOOP
    v_variant_id := NULLIF(v_item->>'variantId', '')::UUID;
    v_qty := GREATEST(0, COALESCE((v_item->>'quantity')::INTEGER, 0));
    IF v_variant_id IS NULL OR v_qty <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE product_variants
       SET stock_quantity = CASE
             WHEN stock_quantity IS NULL THEN NULL
             ELSE stock_quantity + v_qty
           END,
           updated_at = NOW()
     WHERE id = v_variant_id;
  END LOOP;

  UPDATE inventory_reservations
     SET status = 'released',
         released_at = NOW(),
         updated_at = NOW()
   WHERE id = p_reservation_id;
END;
$$;
