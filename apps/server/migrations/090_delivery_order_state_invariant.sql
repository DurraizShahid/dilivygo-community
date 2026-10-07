-- Migration: 090_delivery_order_state_invariant
-- Delivery state and order state are one business invariant. Enforce it in the
-- database so every caller (rider API, vendor API, external assignment, jobs)
-- gets identical behavior.

CREATE OR REPLACE FUNCTION enforce_delivery_order_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_expected_order_status TEXT;
  v_target_order_status TEXT;
  v_order_status TEXT;
  v_updated INTEGER;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Validate the delivery state machine itself.
  IF NOT (
    (OLD.status = 'pending'   AND NEW.status = 'assigned') OR
    (OLD.status = 'assigned'  AND NEW.status = 'picked_up') OR
    (OLD.status = 'picked_up' AND NEW.status = 'arrived') OR
    (OLD.status = 'arrived'   AND NEW.status = 'delivered') OR
    -- Reassignment may return an assigned request to the pending rider pool.
    (OLD.status = 'assigned'  AND NEW.status = 'pending')
  ) THEN
    RAISE EXCEPTION 'invalid delivery transition: % -> %', OLD.status, NEW.status;
  END IF;

  -- Reassignment does not rewind the customer-facing order lifecycle.
  IF OLD.status = 'assigned' AND NEW.status = 'pending' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'assigned' THEN
    v_expected_order_status := 'ready';
    v_target_order_status := 'assigned';
  ELSIF NEW.status = 'picked_up' THEN
    v_expected_order_status := 'assigned';
    v_target_order_status := 'picked_up';
  ELSIF NEW.status = 'arrived' THEN
    v_expected_order_status := 'picked_up';
    v_target_order_status := 'arrived';
  ELSIF NEW.status = 'delivered' THEN
    v_expected_order_status := 'arrived';
    v_target_order_status := 'completed';
  END IF;

  UPDATE orders
     SET status = v_target_order_status,
         updated_at = NOW()
   WHERE id = NEW.order_id
     AND status = v_expected_order_status;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    SELECT status INTO v_order_status FROM orders WHERE id = NEW.order_id;

    -- Idempotent recovery: if another transaction already put the order in the
    -- exact target state, allowing the delivery update is safe.
    IF v_order_status IS DISTINCT FROM v_target_order_status THEN
      RAISE EXCEPTION
        'order/delivery state mismatch for order %: expected %, found %, delivery target %',
        NEW.order_id,
        v_expected_order_status,
        COALESCE(v_order_status, '<missing>'),
        NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deliveries_enforce_order_state_trg ON deliveries;
CREATE TRIGGER deliveries_enforce_order_state_trg
BEFORE UPDATE OF status ON deliveries
FOR EACH ROW
EXECUTE FUNCTION enforce_delivery_order_state();
