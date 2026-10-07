-- Language / i18n settings
INSERT INTO platform_settings (key, value)
VALUES
  ('default_language', 'en'),
  ('language_locked', 'false')
ON CONFLICT (key) DO NOTHING;
