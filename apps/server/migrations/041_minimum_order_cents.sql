-- Migration: 041_minimum_order_cents
-- Adds minimum_order_cents to vendor_settings so shops can enforce a minimum order amount.

ALTER TABLE vendor_settings ADD COLUMN IF NOT EXISTS minimum_order_cents INTEGER DEFAULT 0;
