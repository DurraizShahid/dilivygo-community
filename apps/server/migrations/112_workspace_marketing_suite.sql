-- Migration: 112_workspace_marketing_suite
-- Vendor-scoped marketing infrastructure for embedded multi-tenant social publishing.

CREATE TABLE IF NOT EXISTS workspace_marketing_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'ayrshare',
  provider_ref_id TEXT,
  encrypted_profile_key TEXT,
  profile_key_iv TEXT,
  profile_key_tag TEXT,
  status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured', 'provisioning', 'ready', 'error', 'disabled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_marketing_profiles_scope_uq UNIQUE (organization_id, workspace_id, provider)
);

CREATE INDEX IF NOT EXISTS workspace_marketing_profiles_workspace_idx
  ON workspace_marketing_profiles (organization_id, workspace_id);

CREATE TABLE IF NOT EXISTS workspace_social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_clerk_user_id TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'awaiting_approval', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  scheduled_for TIMESTAMPTZ,
  external_post_id TEXT,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_social_posts_calendar_idx
  ON workspace_social_posts (organization_id, workspace_id, scheduled_for DESC NULLS LAST, created_at DESC);

CREATE INDEX IF NOT EXISTS workspace_social_posts_status_idx
  ON workspace_social_posts (organization_id, workspace_id, status, created_at DESC);

COMMENT ON TABLE workspace_marketing_profiles IS
  'Vendor-scoped marketing provider profiles. Sensitive Ayrshare profile keys are encrypted at rest and never returned to browsers.';

COMMENT ON TABLE workspace_social_posts IS
  'Dilivygo-owned social drafts, approval queue, scheduled posts and publication history for each vendor workspace.';