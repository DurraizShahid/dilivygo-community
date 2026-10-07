-- Vendor commission (workspace + optional per-product) + Stripe Connect on workspaces

-- Platform policy
INSERT INTO platform_settings (key, value)
VALUES ('vendor_commission_model', 'workspace_default')
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_settings (key, value)
VALUES ('vendor_connect_payouts_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- Workspaces: Connect + default commission (bps, nullable = not configured)
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_connect_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_connect_details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vendor_default_commission_bps INTEGER;

ALTER TABLE workspaces
  DROP CONSTRAINT IF EXISTS workspaces_vendor_default_commission_bps_check;

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_vendor_default_commission_bps_check
  CHECK (
    vendor_default_commission_bps IS NULL
    OR (vendor_default_commission_bps >= 0 AND vendor_default_commission_bps <= 10000)
  );

-- Products: optional override when platform model is per_product
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS commission_bps INTEGER;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_commission_bps_check;

ALTER TABLE products
  ADD CONSTRAINT products_commission_bps_check
  CHECK (
    commission_bps IS NULL
    OR (commission_bps >= 0 AND commission_bps <= 10000)
  );

-- Orders: snapshot per shop row (batch checkout = multiple orders / one PI)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS platform_commission_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_payout_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vendor_stripe_transfer_id TEXT;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_platform_commission_cents_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_platform_commission_cents_check
  CHECK (platform_commission_cents >= 0);

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_vendor_payout_cents_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_vendor_payout_cents_check
  CHECK (vendor_payout_cents >= 0);

-- Idempotent Stripe transfers per payment intent + workspace
CREATE TABLE IF NOT EXISTS vendor_payment_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id TEXT NOT NULL,
  project_ref TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  stripe_transfer_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'skipped')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_intent_id, project_ref)
);

CREATE INDEX IF NOT EXISTS vendor_payment_transfers_payment_intent_idx
  ON vendor_payment_transfers (payment_intent_id);

CREATE INDEX IF NOT EXISTS vendor_payment_transfers_project_ref_idx
  ON vendor_payment_transfers (project_ref);
