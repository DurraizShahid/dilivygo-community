-- Migration: 129_cx_competitors
-- Competitor reputation intelligence (Phase 19). Tenant-owned
-- competitor profiles with external place mappings and append-only
-- reputation snapshots. Data enters ONLY through approved paths:
-- staff manual entry of publicly visible metrics, or the deterministic
-- test fixture. No scraping, no live third-party reads — sources are
-- labeled on every row and surfaced in the UI. Additive and idempotent.
-- No seeds.

CREATE TABLE IF NOT EXISTS cx_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_competitors_org_shop_idx
  ON cx_competitors (organization_id, shop_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS cx_competitor_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  competitor_id UUID NOT NULL REFERENCES cx_competitors(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_place_id TEXT NOT NULL,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, external_place_id)
);

CREATE INDEX IF NOT EXISTS cx_competitor_places_competitor_idx
  ON cx_competitor_places (competitor_id);

-- Append-only metric snapshots. rating_05 is the normalized 0–5 score
-- (continuous for aggregates; review-level ints use the P13 contract).
CREATE TABLE IF NOT EXISTS cx_competitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES cx_competitor_places(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rating_raw NUMERIC,
  rating_scale NUMERIC NOT NULL DEFAULT 5,
  rating_05 NUMERIC,
  review_count INTEGER,
  source TEXT NOT NULL CHECK (source IN ('manual', 'fixture')),
  note TEXT,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_competitor_snapshots_place_time_idx
  ON cx_competitor_snapshots (place_id, captured_at DESC);

-- ─── Harden RLS: service_role only (matches 113–128 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_competitors') THEN
    REVOKE ALL ON TABLE cx_competitors FROM anon, authenticated;
    GRANT ALL ON TABLE cx_competitors TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_competitor_places') THEN
    REVOKE ALL ON TABLE cx_competitor_places FROM anon, authenticated;
    GRANT ALL ON TABLE cx_competitor_places TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_competitor_snapshots') THEN
    REVOKE ALL ON TABLE cx_competitor_snapshots FROM anon, authenticated;
    GRANT ALL ON TABLE cx_competitor_snapshots TO service_role;
  END IF;
END $$;
