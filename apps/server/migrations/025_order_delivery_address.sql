-- Migration: 025_order_delivery_address
-- Add delivery address and notes to orders for webhook-created orders

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_notes TEXT;
