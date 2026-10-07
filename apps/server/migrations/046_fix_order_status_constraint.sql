-- Migration: 046_fix_order_status_constraint
-- Fixes the orders_status_check constraint to match the application's actual status values
-- The previous constraint (from 006_scheduled_orders.sql) used incorrect statuses

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'placed', 'accepted', 'rejected', 'preparing', 'ready',
    'assigned', 'picked_up', 'arrived', 'completed', 'cancelled', 'scheduled'
  ));
