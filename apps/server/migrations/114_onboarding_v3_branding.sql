-- Branding is applied only on finalization, in the same transaction as Phase 2.
-- Keep the existing RPC signature for older API deployments.
CREATE OR REPLACE FUNCTION finalize_organization_onboarding_v3_with_branding(
  p_organization_id UUID,
  p_expected_revision INTEGER,
  p_final_payload JSONB,
  p_checklist JSONB,
  p_brand_theme JSONB
)
RETURNS SETOF organization_onboarding_v3
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result organization_onboarding_v3%ROWTYPE;
  v_brand JSONB := p_final_payload -> 'branding';
  v_media JSONB := '{}'::JSONB;
  v_remove TEXT[] := ARRAY[]::TEXT[];
  v_workspace UUID;
BEGIN
  SELECT * INTO v_result FROM finalize_organization_onboarding_v3(
    p_organization_id, p_expected_revision, p_final_payload, p_checklist
  );

  IF jsonb_typeof(v_brand) = 'object'
     AND NOT (COALESCE(p_final_payload -> 'skippedStepIds', '[]'::JSONB) ? 'branding') THEN
    IF v_brand ? 'logoUrl' THEN v_media := v_media || jsonb_build_object('logoUrl', v_brand -> 'logoUrl'); END IF;
    IF v_brand ? 'faviconUrl' THEN v_media := v_media || jsonb_build_object('faviconUrl', v_brand -> 'faviconUrl'); END IF;
    IF v_brand ? 'coverImageUrl' THEN v_media := v_media || jsonb_build_object('ogImageUrl', v_brand -> 'coverImageUrl'); END IF;
    v_media := v_media || jsonb_build_object('appName', p_final_payload -> 'basics' ->> 'businessName');
    IF v_brand ? 'primaryColor' THEN v_remove := v_remove || ARRAY['primary', 'primaryForeground', 'ring']; END IF;
    IF v_brand ? 'accentColor' THEN v_remove := v_remove || ARRAY['accent', 'accentForeground']; END IF;

    INSERT INTO organization_platform_settings (organization_id, key, value, updated_at)
    VALUES (p_organization_id, 'platform_branding', jsonb_strip_nulls(v_media)::TEXT, now())
    ON CONFLICT (organization_id, key) DO UPDATE SET
      value = jsonb_strip_nulls(COALESCE(NULLIF(organization_platform_settings.value, '')::JSONB, '{}'::JSONB) || v_media)::TEXT,
      updated_at = now();

    INSERT INTO organization_platform_settings (organization_id, key, value, updated_at)
    VALUES (p_organization_id, 'platform_theme', p_brand_theme::TEXT, now())
    ON CONFLICT (organization_id, key) DO UPDATE SET
      value = (
        COALESCE(NULLIF(organization_platform_settings.value, '')::JSONB, '{}'::JSONB) ||
        jsonb_build_object(
          'light', (COALESCE(NULLIF(organization_platform_settings.value, '')::JSONB -> 'light', '{}'::JSONB) - v_remove) || COALESCE(p_brand_theme -> 'light', '{}'::JSONB),
          'dark', (COALESCE(NULLIF(organization_platform_settings.value, '')::JSONB -> 'dark', '{}'::JSONB) - v_remove) || COALESCE(p_brand_theme -> 'dark', '{}'::JSONB)
        )
      )::TEXT,
      updated_at = now();

    -- Original color choices + preferred appearance survive resume independently
    -- of the contrast-adjusted light/dark tokens. No forced visitor theme change.
    INSERT INTO organization_platform_settings (organization_id, key, value, updated_at)
    VALUES (p_organization_id, 'onboarding_branding', v_brand::TEXT, now())
    ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    -- A single brand also uses these choices on its initial vendor/POS workspace.
    -- Marketplace vendors retain their own independent branding.
    IF p_final_payload ->> 'businessType' = 'single_brand' THEN
      SELECT id INTO v_workspace FROM workspaces
      WHERE organization_id = p_organization_id ORDER BY created_at ASC LIMIT 1;
      UPDATE workspaces SET public_theme_overlay =
        jsonb_strip_nulls(COALESCE(public_theme_overlay, '{}'::JSONB) || v_media) ||
        jsonb_build_object(
          'light', (COALESCE(public_theme_overlay -> 'light', '{}'::JSONB) - v_remove) || COALESCE(p_brand_theme -> 'light', '{}'::JSONB),
          'dark', (COALESCE(public_theme_overlay -> 'dark', '{}'::JSONB) - v_remove) || COALESCE(p_brand_theme -> 'dark', '{}'::JSONB)
        ), updated_at = now()
      WHERE id = v_workspace AND organization_id = p_organization_id;
    END IF;
  END IF;

  RETURN NEXT v_result;
END;
$$;
REVOKE ALL ON FUNCTION finalize_organization_onboarding_v3_with_branding(UUID, INTEGER, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finalize_organization_onboarding_v3_with_branding(UUID, INTEGER, JSONB, JSONB, JSONB) TO service_role;
