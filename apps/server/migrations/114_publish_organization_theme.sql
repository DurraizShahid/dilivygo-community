-- 114_publish_organization_theme.sql — additive, idempotent
-- Atomic theme publication: version compare + theme persist + version increment
-- + history insert happen in a single transaction with row locking.
--
-- Race fixed:
--   Admin A reads v5, Admin B reads v5, both publish → only one must succeed.
-- Without this RPC the controller did read-then-write in separate statements
-- (check If-Match, set platform_theme, set theme_version, insert history),
-- allowing lost updates under concurrency.

-- History table is created in 113; ensure it exists for fresh installs that
-- might apply migrations out of order (defensive, idempotent).
CREATE TABLE IF NOT EXISTS theme_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  theme_snapshot JSONB NOT NULL,
  branding_snapshot JSONB,
  source TEXT NOT NULL CHECK (source IN ('manual','logo_generated','preset','restored')),
  logo_hash TEXT,
  strategy TEXT,
  generator_version TEXT,
  analyzer_version TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restored_from UUID REFERENCES theme_history(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_theme_history_org_created ON theme_history(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_theme_history_org_id ON theme_history(organization_id);

-- Atomic publish RPC.
-- Locks the organization's theme_version row (or the org row as fallback) so
-- concurrent publishers serialize. Compares expected version, persists theme,
-- bumps version, inserts history — all or nothing.
CREATE OR REPLACE FUNCTION publish_organization_theme(
  p_organization_id UUID,
  p_theme_json TEXT,
  p_expected_version INTEGER,
  p_source TEXT,
  p_logo_hash TEXT,
  p_strategy TEXT,
  p_generator_version TEXT,
  p_analyzer_version TEXT,
  p_created_by TEXT,
  p_restored_from UUID
)
RETURNS TABLE (new_version INTEGER, history_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER;
  v_next INTEGER;
  v_history_id UUID;
BEGIN
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'THEME_EXPECTED_VERSION_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_source NOT IN ('manual','logo_generated','preset','restored') THEN
    RAISE EXCEPTION 'THEME_SOURCE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Serialize publishers for this org: lock the version row if present.
  -- FOR UPDATE on a possibly-missing row locks nothing, so also lock the
  -- parent org row which always exists (prevents lost updates on first publish).
  PERFORM 1 FROM organizations WHERE id = p_organization_id FOR UPDATE;
  SELECT NULLIF(value, '')::INTEGER INTO v_current
    FROM organization_platform_settings
    WHERE organization_id = p_organization_id AND key = 'theme_version'
    FOR UPDATE;
  IF v_current IS NULL THEN
    v_current := 0;
  END IF;

  IF p_expected_version <> v_current THEN
    RAISE EXCEPTION 'THEME_VERSION_CONFLICT:%:%', v_current, p_expected_version
      USING ERRCODE = 'P0001';
  END IF;

  v_next := v_current + 1;

  INSERT INTO organization_platform_settings (organization_id, key, value, updated_at)
  VALUES (p_organization_id, 'platform_theme', p_theme_json, NOW())
  ON CONFLICT (organization_id, key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  INSERT INTO organization_platform_settings (organization_id, key, value, updated_at)
  VALUES (p_organization_id, 'theme_version', v_next::TEXT, NOW())
  ON CONFLICT (organization_id, key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

  INSERT INTO theme_history (
    organization_id, theme_snapshot, branding_snapshot, source,
    logo_hash, strategy, generator_version, analyzer_version, created_by, restored_from
  )
  VALUES (
    p_organization_id, p_theme_json::JSONB, NULL, p_source,
    p_logo_hash, p_strategy, p_generator_version, p_analyzer_version, p_created_by, p_restored_from
  )
  RETURNING id INTO v_history_id;

  new_version := v_next;
  history_id := v_history_id;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION publish_organization_theme(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID)
  IS 'Atomic org theme publish: locks org, checks expected version, persists theme, bumps version, inserts history.';


REVOKE ALL ON FUNCTION publish_organization_theme(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION publish_organization_theme(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
