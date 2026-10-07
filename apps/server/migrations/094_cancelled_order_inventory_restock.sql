-- Migration: 094_cancelled_order_inventory_restock
-- A checkout reservation decrements finite variant stock before payment. If a
-- paid order is subsequently cancelled/rejected before fulfillment, return only
-- THAT order's variant quantities exactly once. This is per-order rather than
-- per-reservation so multi-shop checkouts do not restock sibling orders.

CREATE TABLE IF NOT EXISTS inventory_restock_events (
  order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION restock_order_inventory_once(
  p_order_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_item RECORD;
  v_inserted INTEGER := 0;
BEGIN
  INSERT INTO inventory_restock_events (order_id, reason)
  VALUES (p_order_id, COALESCE(NULLIF(p_reason, ''), 'order_terminal'))
  ON CONFLICT (order_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN FALSE;
  END IF;

  FOR v_item IN
    SELECT product_variant_id AS variant_id, SUM(quantity)::INTEGER AS quantity
      FROM order_items
     WHERE order_id = p_order_id
       AND product_variant_id IS NOT NULL
     GROUP BY product_variant_id
     ORDER BY product_variant_id
  LOOP
    -- NULL stock means unlimited; preserve it. Row lock is taken by UPDATE so
    -- concurrent checkout reservations/restocks serialize on this variant.
    UPDATE product_variants
       SET stock_quantity = CASE
             WHEN stock_quantity IS NULL THEN NULL
             ELSE stock_quantity + v_item.quantity
           END,
           updated_at = NOW()
     WHERE id = v_item.variant_id;
  END LOOP;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION restock_terminal_order_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'rejected')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
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
