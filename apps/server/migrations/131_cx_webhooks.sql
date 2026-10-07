-- Migration: 131_cx_webhooks
-- Guest Experience outbound webhooks (Phase 21). Tenant-configured
-- endpoints with event subscriptions, optional shop scope, encrypted
-- signing secrets (AES-GCM via the shared transport), and an async
-- delivery outbox with bounded retries and terminal failure state.
-- Delivery rows are idempotent per (endpoint, event): retries and manual
-- resends never change event identity. Additive and idempotent. No seeds.

CREATE TABLE IF NOT EXISTS cx_webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret_encrypted TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  last_delivery_at TIMESTAMPTZ,
  last_delivery_status TEXT,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_webhook_endpoints_org_idx
  ON cx_webhook_endpoints (organization_id) WHERE active;

CREATE TABLE IF NOT EXISTS cx_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES cx_webhook_endpoints(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_http_status INTEGER,
  last_error TEXT,
  duration_ms INTEGER,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (endpoint_id, event_id)
);

CREATE INDEX IF NOT EXISTS cx_webhook_deliveries_due_idx
  ON cx_webhook_deliveries (status, next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS cx_webhook_deliveries_endpoint_idx
  ON cx_webhook_deliveries (endpoint_id, created_at DESC);

-- ─── Harden RLS: service_role only (matches 113–130 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_webhook_endpoints') THEN
    REVOKE ALL ON TABLE cx_webhook_endpoints FROM anon, authenticated;
    GRANT ALL ON TABLE cx_webhook_endpoints TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_webhook_deliveries') THEN
    REVOKE ALL ON TABLE cx_webhook_deliveries FROM anon, authenticated;
    GRANT ALL ON TABLE cx_webhook_deliveries TO service_role;
  END IF;
END $$;
