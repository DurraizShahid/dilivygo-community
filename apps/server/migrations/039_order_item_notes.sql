-- Migration: 039_order_item_notes
-- Add per-item special instructions (notes) to order_items

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes TEXT;
