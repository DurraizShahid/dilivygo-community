-- Migration: 093_inventory_payment_consumption
-- Link and consume a checkout inventory reservation in the SAME database
-- transaction that inserts a paid order. This makes stock consumption survive
-- webhook retries/crashes without relying on controller sequencing.

CREATE OR REPLACE FUNCTION consume_order_inventory_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_reservation_id TEXT;
  v_status TEXT;
BEGIN
  IF NEW.payment_intent_id IS NULL OR NEW.payment_status <> 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT id, status
    INTO v_reservation_id, v_status
    FROM inventory_reservations
   WHERE payment_intent_id = NEW.payment_intent_id
     AND status IN ('reserved', 'consumed')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  NEW.inventory_reservation_id := v_reservation_id;

  IF v_status = 'reserved' THEN
    UPDATE inventory_reservations
       SET status = 'consumed',
           consumed_at = NOW(),
           updated_at = NOW()
     WHERE id = v_reservation_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consume_order_inventory_reservation ON orders;
CREATE TRIGGER trg_consume_order_inventory_reservation
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION consume_order_inventory_reservation();

-- Defense in depth for flows that create an unpaid row and later mark it paid.
CREATE OR REPLACE FUNCTION consume_order_inventory_reservation_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_reservation_id TEXT;
BEGIN
  IF NEW.payment_intent_id IS NULL
     OR NEW.payment_status <> 'paid'
     OR OLD.payment_status = 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT id
    INTO v_reservation_id
    FROM inventory_reservations
   WHERE payment_intent_id = NEW.payment_intent_id
     AND status IN ('reserved', 'consumed')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  NEW.inventory_reservation_id := v_reservation_id;

  UPDATE inventory_reservations
     SET status = 'consumed',
         consumed_at = COALESCE(consumed_at, NOW()),
         updated_at = NOW()
   WHERE id = v_reservation_id
     AND status = 'reserved';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consume_order_inventory_on_payment ON orders;
CREATE TRIGGER trg_consume_order_inventory_on_payment
BEFORE UPDATE OF payment_status ON orders
FOR EACH ROW
EXECUTE FUNCTION consume_order_inventory_reservation_on_payment();
