-- Migration: 026_platform_settings
-- Key-value store for platform-level configuration (Stripe, feature flags, etc.)

CREATE TABLE IF NOT EXISTS platform_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
