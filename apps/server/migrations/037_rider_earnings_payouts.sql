-- Migration: 037_rider_earnings_payouts
-- Adds delivery fee tracking on orders, unified rider earnings ledger,
-- rider payouts table, and Stripe Connect fields on app_users.

-- ── Delivery fee on orders ─────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_fee_cents INTEGER NOT NULL DEFAULT 0;

-- ── Rider delivery fee on deliveries ───────────────────────────────────
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS rider_delivery_fee_cents INTEGER NOT NULL DEFAULT 0;

-- ── Unified rider earnings ledger ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS rider_earnings (
  id UUID PRIMARY KEY,
  rider_id TEXT NOT NULL,
  project_ref TEXT NOT NULL,
  order_id UUID REFERENCES orders(id),
  delivery_id UUID REFERENCES deliveries(id),
  type TEXT NOT NULL CHECK (type IN ('delivery_fee', 'tip')),
  gross_cents INTEGER NOT NULL DEFAULT 0 CHECK (gross_cents >= 0),
  platform_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  net_cents INTEGER NOT NULL DEFAULT 0 CHECK (net_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Rider payouts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rider_payouts (
  id UUID PRIMARY KEY,
  rider_id TEXT NOT NULL,
  project_ref TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'rejected')),
  payout_method TEXT NOT NULL DEFAULT 'manual'
    CHECK (payout_method IN ('stripe_connect', 'bank_transfer', 'manual')),
  stripe_transfer_id TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  note TEXT,
  processed_by TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Stripe Connect on users ────────────────────────────────────────────
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS payout_method TEXT DEFAULT 'manual';

-- ── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rider_earnings_rider      ON rider_earnings(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_project    ON rider_earnings(project_ref);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_order      ON rider_earnings(order_id);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_created    ON rider_earnings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_earnings_type       ON rider_earnings(type);
CREATE INDEX IF NOT EXISTS idx_rider_payouts_rider       ON rider_payouts(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_payouts_status      ON rider_payouts(status);
CREATE INDEX IF NOT EXISTS idx_rider_payouts_project     ON rider_payouts(project_ref);
CREATE INDEX IF NOT EXISTS idx_rider_payouts_created     ON rider_payouts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_fee       ON orders(delivery_fee_cents) WHERE delivery_fee_cents > 0;

-- ── Platform settings defaults ─────────────────────────────────────────
-- Rider gets 100% of delivery fee by default (10000 bps = 100%)
INSERT INTO platform_settings (key, value)
VALUES ('rider_delivery_fee_bps', '10000')
ON CONFLICT (key) DO NOTHING;
