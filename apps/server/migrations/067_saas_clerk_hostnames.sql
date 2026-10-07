-- Migration: 067_saas_clerk_hostnames
-- SaaS: Clerk workspace ownership + hostname → workspace mapping for multi-tenant web routing.

CREATE TABLE IF NOT EXISTS workspace_clerk_owners (
  clerk_user_id TEXT PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  bootstrap_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_clerk_owners_workspace_uq UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS workspace_clerk_owners_workspace_id_idx
  ON workspace_clerk_owners(workspace_id);

CREATE TABLE IF NOT EXISTS workspace_hostnames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  app_surface TEXT NOT NULL DEFAULT 'customer',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_hostnames_surface_check CHECK (
    app_surface IN ('customer', 'vendor', 'rider', 'superadmin', 'pos', 'apex')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_hostnames_hostname_lower_uq
  ON workspace_hostnames(lower(hostname));

CREATE INDEX IF NOT EXISTS workspace_hostnames_workspace_id_idx
  ON workspace_hostnames(workspace_id);
