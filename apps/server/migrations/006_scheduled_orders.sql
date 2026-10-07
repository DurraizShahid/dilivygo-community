-- Migration: 006_scheduled_orders
-- Adds scheduled order support

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- Expand status constraint
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'placed', 'accepted', 'rejected', 'preparing', 'ready',
    'assigned', 'picked_up', 'arrived', 'completed', 'cancelled', 'scheduled'
  ));

CREATE INDEX IF NOT EXISTS idx_orders_scheduled ON orders(scheduled_for) WHERE status = 'scheduled';
