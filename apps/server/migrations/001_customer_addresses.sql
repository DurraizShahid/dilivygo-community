-- Migration: 001_customer_addresses
-- Adds customer delivery address book table

CREATE TABLE IF NOT EXISTS customer_addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label         TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  postcode      TEXT,
  lat           DECIMAL(10, 8),
  lon           DECIMAL(11, 8),
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);
