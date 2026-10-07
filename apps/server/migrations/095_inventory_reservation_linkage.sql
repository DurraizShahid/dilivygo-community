-- Migration: 095_inventory_reservation_linkage
-- Correct two inventory-accounting edge cases:
--   1. wallet/demo fulfillment creates the order before the reservation can be
--      linked to its synthetic payment id, so attach must also work AFTER the
--      reservation has been consumed and backfill existing orders;
--   2. cancellation restock must only touch orders that actually participated
--      in the reservation system, otherwise legacy variant orders would inflate
--      stock that was never decremented.

CREATE UNIQUE INDEX IF NOT EXISTS inventory_reservations_payment_intent_uq
  ON inventory_reservations(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION attach_inventory_reservation_payment(
  p_reservation_id TEXT,
  p_payment_intent_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
  v_existing_payment_intent_id TEXT;
BEGIN
  IF p_reservation_id IS NULL OR btrim(p_reservation_id) = '' THEN
    RAISE EXCEPTION 'reservation id is required';
  END IF;
  IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
    RAISE EXCEPTION 'payment intent id is required';
  END IF;

  SELECT status, payment_intent_id
    INTO v_status, v_existing_payment_intent_id
    FROM inventory_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory reservation not found';
  END IF;
  IF v_status = 'released' THEN
    RAISE EXCEPTION 'inventory reservation is no longer active';
  END IF;
  IF v_existing_payment_intent_id IS NOT NULL
     AND v_existing_payment_intent_id <> p_payment_intent_id THEN
    RAISE EXCEPTION 'inventory reservation is already linked to another payment';
  END IF;

  UPDATE inventory_reservations
     SET payment_intent_id = p_payment_intent_id,
         updated_at = NOW()
   WHERE id = p_reservation_id;

  -- Wallet-only/demo checkout may already have inserted its paid order using a
  -- synthetic payment id before this linkage exists. Bind those rows now so a
  -- later cancellation can restock only inventory that was truly reserved.
  UPDATE orders
     SET inventory_reservation_id = p_reservation_id,
         updated_at = NOW()
   WHERE payment_intent_id = p_payment_intent_id
     AND inventory_reservation_id IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION restock_terminal_order_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'rejected')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.inventory_reservation_id IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM inventory_reservations r
        WHERE r.id = NEW.inventory_reservation_id
          AND r.status = 'consumed'
     ) THEN
    PERFORM restock_order_inventory_once(NEW.id, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restock_terminal_order_inventory ON orders;
CREATE TRIGGER trg_restock_terminal_order_inventory
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION restock_terminal_order_inventory();
