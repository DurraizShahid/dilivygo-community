-- Replace platform_themes with platform_settings.platform_branding (JSON).

INSERT INTO platform_settings (key, value, updated_at)
VALUES ('platform_branding', '{}', NOW())
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_themes'
  ) THEN
    UPDATE platform_settings ps
    SET value = migrated.payload, updated_at = NOW()
    FROM (
      SELECT json_strip_nulls(
        json_build_object(
          'appName', NULLIF(btrim(pt.light_theme->>'appName'), ''),
          'logoUrl', NULLIF(btrim(pt.light_theme->>'logoUrl'), ''),
          'faviconUrl', NULLIF(btrim(pt.light_theme->>'faviconUrl'), ''),
          'wordmarkUrl', NULLIF(btrim(pt.light_theme->>'wordmarkUrl'), ''),
          'ogImageUrl', NULLIF(btrim(pt.light_theme->>'ogImageUrl'), ''),
          'supportEmail', NULLIF(btrim(pt.light_theme->>'supportEmail'), ''),
          'helpUrl', NULLIF(btrim(pt.light_theme->>'helpUrl'), '')
        )
      )::text AS payload
      FROM platform_themes pt
      WHERE pt.app_target = 'global' AND pt.workspace_id IS NULL
      LIMIT 1
    ) migrated
    WHERE ps.key = 'platform_branding'
      AND EXISTS (
        SELECT 1 FROM platform_themes
        WHERE app_target = 'global' AND workspace_id IS NULL
      );
  END IF;
END $$;

DROP TABLE IF EXISTS platform_themes;
