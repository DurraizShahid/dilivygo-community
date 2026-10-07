-- Migration: 008_indexes
-- Hot query column indexes for production performance

CREATE INDEX IF NOT EXISTS idx_orders_project_ref   ON orders(project_ref);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id   ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at    ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id  ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_session   ON cart_items(session_id);
