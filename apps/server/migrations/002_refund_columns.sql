-- Migration: 002_refund_columns
-- Adds refund tracking columns to orders table

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refund_amount_cents   INTEGER,
  ADD COLUMN IF NOT EXISTS refund_reason         TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_reason   TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by          TEXT;

-- Update payment_status check constraint to include refund states
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid', 'paid', 'refunded', 'partially_refunded'));
