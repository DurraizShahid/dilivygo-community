-- 113_theme_history.sql — additive, idempotent
-- Stores immutable organization theme PUBLISH snapshots for history/rollback.

CREATE TABLE IF NOT EXISTS theme_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  theme_snapshot JSONB NOT NULL, -- { light: ThemeColors, dark: ThemeColors }
  branding_snapshot JSONB, -- optional: relevant branding at publish time
  source TEXT NOT NULL CHECK (source IN ('manual','logo_generated','preset','restored')),
  logo_hash TEXT,
  strategy TEXT,
  generator_version TEXT,
  analyzer_version TEXT,
  created_by TEXT, -- clerkUserId or null
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restored_from UUID REFERENCES theme_history(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_theme_history_org_created ON theme_history(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_theme_history_org_id ON theme_history(organization_id);
