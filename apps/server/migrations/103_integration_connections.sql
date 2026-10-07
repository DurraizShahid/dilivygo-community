-- Tenant-scoped external integration connection registry.
-- Provider credentials/tokens are deliberately NOT stored here. Nango owns
-- credential encryption and refresh; Dilivygo stores only the opaque Nango
-- connection id plus non-sensitive connection metadata.

CREATE TABLE IF NOT EXISTS integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL,
  nango_integration_id TEXT NOT NULL,
  connection_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  auth_mode TEXT,
  provider TEXT,
  environment TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT integration_connections_status_check
    CHECK (status IN ('pending', 'connected', 'error', 'disconnected')),
  CONSTRAINT integration_connections_org_provider_unique
    UNIQUE (organization_id, provider_key)
);

CREATE INDEX IF NOT EXISTS integration_connections_organization_idx
  ON integration_connections (organization_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS integration_connections_connection_id_unique
  ON integration_connections (connection_id)
  WHERE connection_id IS NOT NULL;
