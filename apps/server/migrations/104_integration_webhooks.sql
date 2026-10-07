-- Reliable organization-scoped outbound integration webhooks.
-- Endpoint signing secrets are encrypted by the application before persistence.

CREATE TABLE IF NOT EXISTS integration_webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  event_types TEXT[] NOT NULL DEFAULT ARRAY['order.created','order.status_changed','order.refunded']::TEXT[],
  signing_secret_encrypted TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT integration_webhook_endpoints_provider_check CHECK (provider_key IN ('n8n','zapier','make')),
  CONSTRAINT integration_webhook_endpoints_org_provider_uq UNIQUE (organization_id, provider_key)
);

CREATE INDEX IF NOT EXISTS integration_webhook_endpoints_org_active_idx
  ON integration_webhook_endpoints (organization_id, active);

CREATE TABLE IF NOT EXISTS integration_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES integration_webhook_endpoints(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_http_status INTEGER,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT integration_webhook_deliveries_status_check
    CHECK (status IN ('pending','processing','delivered','dead')),
  CONSTRAINT integration_webhook_deliveries_endpoint_event_uq UNIQUE (endpoint_id, event_id)
);

CREATE INDEX IF NOT EXISTS integration_webhook_deliveries_due_idx
  ON integration_webhook_deliveries (status, next_attempt_at)
  WHERE status = 'pending';
