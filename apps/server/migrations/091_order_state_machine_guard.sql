-- Migration: 091_order_state_machine_guard
-- Application-level validateTransition() calls are easy to forget and race
-- against concurrent requests. Make invalid order transitions impossible in DB.

CREATE OR REPLACE FUNCTION enforce_order_state_machine()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF (
    (OLD.status = 'placed'    AND NEW.status IN ('accepted', 'rejected', 'cancelled')) OR
    (OLD.status = 'scheduled' AND NEW.status IN ('placed', 'cancelled')) OR
    (OLD.status = 'accepted'  AND NEW.status IN ('preparing', 'cancelled')) OR
    (OLD.status = 'preparing' AND NEW.status IN ('ready', 'cancelled')) OR
    (OLD.status = 'ready'     AND NEW.status IN ('assigned', 'cancelled')) OR
    (OLD.status = 'assigned'  AND NEW.status IN ('picked_up', 'cancelled')) OR
    (OLD.status = 'picked_up' AND NEW.status = 'arrived') OR
    (OLD.status = 'arrived'   AND NEW.status = 'completed') OR
    (OLD.status = 'ready' AND NEW.status = 'completed' AND OLD.pos_checkout_mode = 'kitchen')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid order transition: % -> %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS orders_enforce_state_machine_trg ON orders;
CREATE TRIGGER orders_enforce_state_machine_trg
BEFORE UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION enforce_order_state_machine();
