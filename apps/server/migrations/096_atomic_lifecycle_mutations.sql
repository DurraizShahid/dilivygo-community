-- Migration: 096_atomic_lifecycle_mutations
-- Collapse multi-write lifecycle mutations into one transaction. The existing
-- state-machine triggers remain authoritative and roll the WHOLE mutation back
-- if the linked order/delivery cannot legally advance.

CREATE OR REPLACE FUNCTION accept_order_atomic(
  p_order_id UUID,
  p_prep_time_minutes INTEGER
)
RETURNS SETOF orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_prep INTEGER := GREATEST(1, LEAST(COALESCE(p_prep_time_minutes, 20), 1440));
BEGIN
  RETURN QUERY
    UPDATE orders
       SET status = 'accepted',
           prep_time_minutes = v_prep,
           sla_deadline = NOW() + make_interval(mins => v_prep),
           sla_breached = FALSE,
           updated_at = NOW()
     WHERE id = p_order_id
       AND status = 'placed'
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION claim_delivery_atomic(
  p_delivery_id UUID,
  p_rider_id UUID
)
RETURNS SETOF deliveries
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    UPDATE deliveries
       SET rider_id = p_rider_id,
           external_rider_name = NULL,
           external_rider_phone = NULL,
           is_external = FALSE,
           claimed_at = NOW(),
           status = 'assigned',
           updated_at = NOW()
     WHERE id = p_delivery_id
       AND status = 'pending'
       AND rider_id IS NULL
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION assign_external_delivery_atomic(
  p_delivery_id UUID,
  p_name TEXT,
  p_phone TEXT
)
RETURNS SETOF deliveries
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    UPDATE deliveries
       SET rider_id = NULL,
           external_rider_name = NULLIF(btrim(p_name), ''),
           external_rider_phone = NULLIF(btrim(p_phone), ''),
           is_external = TRUE,
           claimed_at = NOW(),
           status = 'assigned',
           updated_at = NOW()
     WHERE id = p_delivery_id
       AND status = 'pending'
       AND rider_id IS NULL
    RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION reassign_delivery_atomic(
  p_delivery_id UUID
)
RETURNS SETOF deliveries
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    UPDATE deliveries
       SET rider_id = NULL,
           external_rider_name = NULL,
           external_rider_phone = NULL,
           is_external = FALSE,
           claimed_at = NULL,
           status = 'pending',
           updated_at = NOW()
     WHERE id = p_delivery_id
       AND status = 'assigned'
    RETURNING *;
END;
$$;
