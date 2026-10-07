-- Migration: 009_order_lifecycle
-- Full order lifecycle: new order columns, ratings, tips, vendor settings

-- ── New columns on orders ──────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prep_time_minutes INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_mode TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ── Delivery status default ────────────────────────────────────────────
ALTER TABLE deliveries ALTER COLUMN status SET DEFAULT 'pending';

-- ── Ratings table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  to_role TEXT NOT NULL CHECK (to_role IN ('vendor', 'rider')),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tips table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tips (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  from_customer_id TEXT NOT NULL,
  to_rider_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Vendor settings table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_settings (
  id UUID PRIMARY KEY,
  project_ref TEXT UNIQUE NOT NULL,
  auto_accept BOOLEAN DEFAULT FALSE,
  default_prep_time_minutes INTEGER DEFAULT 20,
  delivery_mode TEXT DEFAULT 'third_party' CHECK (delivery_mode IN ('third_party', 'vendor_rider')),
  delivery_radius_km FLOAT DEFAULT 5.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ratings_order   ON ratings(order_id);
CREATE INDEX IF NOT EXISTS idx_ratings_to_user ON ratings(to_user_id);
CREATE INDEX IF NOT EXISTS idx_tips_order      ON tips(order_id);
CREATE INDEX IF NOT EXISTS idx_tips_rider      ON tips(to_rider_id);
