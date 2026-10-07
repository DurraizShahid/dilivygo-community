-- Migration: 123_cx_reputation
-- External reputation inbox + ingestion framework (Phase 13).
-- Provider-neutral: connections, per-shop location mappings, normalized
-- external reviews (deduplicated per org+provider+external id), raw
-- provider envelopes preserved for debugging, and sync run history.
-- Additive and idempotent. No seeds: every provider starts unconfigured.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Provider connections (one row per org × provider) ────────────────────
CREATE TABLE IF NOT EXISTS cx_review_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN (
    'google', 'facebook', 'tripadvisor', 'yelp',
    'talabat', 'zomato', 'foodpanda', 'ubereats', 'doordash',
    'manual', 'fixture'
  )),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unconfigured'
    CHECK (status IN ('active', 'paused', 'error', 'unconfigured')),
  -- HMAC secret for inbound provider webhooks. Server-side only, never
  -- returned in full (masked in API output). NULL until rotated/set.
  webhook_secret TEXT,
  sync_cursor TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider)
);

CREATE INDEX IF NOT EXISTS cx_review_connections_org_idx
  ON cx_review_connections (organization_id);

COMMENT ON TABLE cx_review_connections IS 'External review provider connections. No live third-party sync exists yet: google/facebook/tripadvisor/yelp/marketplaces stay unconfigured until an approved API integration lands; manual/fixture/webhook paths work today.';
COMMENT ON COLUMN cx_review_connections.webhook_secret IS 'HMAC-SHA256 secret for inbound webhooks. Service-role only, masked in reads.';

-- ─── Provider locations → shop mappings ───────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_review_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES cx_review_connections(id) ON DELETE CASCADE,
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  external_location_id TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_location_id)
);

CREATE INDEX IF NOT EXISTS cx_review_locations_org_shop_idx
  ON cx_review_locations (organization_id, shop_id);

COMMENT ON TABLE cx_review_locations IS 'Maps a provider-side location (place id, page id, store code) to a Dilivygo shop. Cross-org shop links are rejected at write time.';

-- ─── Normalized external reviews ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_external_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES cx_review_connections(id) ON DELETE SET NULL,
  location_id UUID REFERENCES cx_review_locations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  rating_1_5 INTEGER CHECK (rating_1_5 IS NULL OR rating_1_5 BETWEEN 1 AND 5),
  rating_original NUMERIC,
  rating_scale TEXT,
  title TEXT,
  body TEXT,
  reviewer_name TEXT,
  reviewer_url TEXT,
  review_url TEXT,
  external_created_at TIMESTAMPTZ,
  external_updated_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'acknowledged', 'replied', 'archived')),
  -- Raw provider envelope preserved for debugging; never trusted for
  -- authorization or money, and never rendered unescaped to staff UIs.
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS cx_external_reviews_org_shop_time_idx
  ON cx_external_reviews (organization_id, shop_id, external_created_at DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS cx_external_reviews_connection_idx
  ON cx_external_reviews (connection_id)
  WHERE connection_id IS NOT NULL;

COMMENT ON TABLE cx_external_reviews IS 'Normalized external reviews. Ratings normalized to 1–5 (original kept). Deduped per org+provider+external_id; re-sync updates provider fields but never overwrites staff status.';
COMMENT ON COLUMN cx_external_reviews.raw IS 'Untrusted provider payload. Debug use only; render escaped.';

-- ─── Sync run history ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_review_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES cx_review_connections(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed')),
  cursor_in TEXT,
  cursor_out TEXT,
  fetched INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cx_review_sync_runs_org_time_idx
  ON cx_review_sync_runs (organization_id, started_at DESC);

COMMENT ON TABLE cx_review_sync_runs IS 'Every sync attempt, including failed ones for unconfigured providers — failures are explicit, never silent.';

-- ─── Harden RLS: service_role only (matches 113–122 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_review_connections') THEN
    REVOKE ALL ON TABLE cx_review_connections FROM anon, authenticated;
    GRANT ALL ON TABLE cx_review_connections TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_review_locations') THEN
    REVOKE ALL ON TABLE cx_review_locations FROM anon, authenticated;
    GRANT ALL ON TABLE cx_review_locations TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_external_reviews') THEN
    REVOKE ALL ON TABLE cx_external_reviews FROM anon, authenticated;
    GRANT ALL ON TABLE cx_external_reviews TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_review_sync_runs') THEN
    REVOKE ALL ON TABLE cx_review_sync_runs FROM anon, authenticated;
    GRANT ALL ON TABLE cx_review_sync_runs TO service_role;
  END IF;
END $$;
