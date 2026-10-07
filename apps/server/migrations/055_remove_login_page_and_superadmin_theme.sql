-- Remove per-app login page builder config and superadmin_web theme overrides.
-- Table may already be absent on some databases (e.g. partial history).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'platform_themes'
  ) THEN
    DELETE FROM platform_themes WHERE app_target = 'superadmin_web';
    ALTER TABLE platform_themes DROP COLUMN IF EXISTS login_page;
  END IF;
END $$;
