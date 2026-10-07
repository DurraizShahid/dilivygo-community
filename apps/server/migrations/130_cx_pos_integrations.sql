-- Migration: 130_cx_pos_integrations
-- External POS feedback integrations (Phase 20). External orders live
-- in cx_pos_orders — NEVER in canonical orders — so money flows
-- (payouts, commissions, accounting) cannot be contaminated. Survey
-- eligibility reuses the native trigger path via cx_scheduled_requests
-- rows that reference pos_order_id instead of order_id. Location mapping
-- is staff-configured only (never payload-spoofable); unmapped data lands
-- in the error queue. Additive and idempotent. No seeds.

CREATE TABLE IF NOT EXISTS cx_pos_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'error')),
  -- Staff-configured location mapping: { externalLocationId: shopId }.
  -- Payload location ids NEVER map implicitly.
  shop_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  webhook_secret TEXT,
  cursor TEXT,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_pos_connections_org_idx
  ON cx_pos_connections (organization_id);

CREATE TABLE IF NOT EXISTS cx_pos_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES cx_pos_connections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_order_id TEXT NOT NULL,
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  total_cents INTEGER CHECK (total_cents IS NULL OR total_cents >= 0),
  currency TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Informational payment record only (method + amount). No money moves.
  payment JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Minimal provider refs for reconciliation (ids + timestamps, no PII).
  raw_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ,
  survey_scheduled BOOLEAN NOT NULL DEFAULT FALSE,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, external_order_id)
);

CREATE INDEX IF NOT EXISTS cx_pos_orders_org_shop_idx
  ON cx_pos_orders (organization_id, shop_id, occurred_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS cx_pos_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES cx_pos_connections(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'partial', 'failed')),
  fetched INTEGER NOT NULL DEFAULT 0,
  imported INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  cursor TEXT,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cx_pos_sync_runs_connection_idx
  ON cx_pos_sync_runs (connection_id, started_at DESC);

CREATE TABLE IF NOT EXISTS cx_pos_error_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES cx_pos_connections(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('unmapped_location', 'unmapped_customer', 'import_failed')),
  external_order_id TEXT,
  provider TEXT,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_pos_error_queue_org_status_idx
  ON cx_pos_error_queue (organization_id, status, created_at DESC);

-- Survey path for external orders: scheduled rows reference the POS order
-- (order_id stays NULL so canonical-order FKs never see foreign ids).
ALTER TABLE cx_scheduled_requests
  ADD COLUMN IF NOT EXISTS pos_order_id UUID REFERENCES cx_pos_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cx_scheduled_requests_pos_order_idx
  ON cx_scheduled_requests (pos_order_id) WHERE pos_order_id IS NOT NULL;

-- ─── Harden RLS: service_role only (matches 113–129 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_pos_connections') THEN
    REVOKE ALL ON TABLE cx_pos_connections FROM anon, authenticated;
    GRANT ALL ON TABLE cx_pos_connections TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_pos_orders') THEN
    REVOKE ALL ON TABLE cx_pos_orders FROM anon, authenticated;
    GRANT ALL ON TABLE cx_pos_orders TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_pos_sync_runs') THEN
    REVOKE ALL ON TABLE cx_pos_sync_runs FROM anon, authenticated;
    GRANT ALL ON TABLE cx_pos_sync_runs TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_pos_error_queue') THEN
    REVOKE ALL ON TABLE cx_pos_error_queue FROM anon, authenticated;
    GRANT ALL ON TABLE cx_pos_error_queue TO service_role;
  END IF;
END $$;
