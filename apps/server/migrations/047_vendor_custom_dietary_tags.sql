-- Per-shop custom dietary / allergy tag definitions (code + label). Preset platform tags stay implicit.
ALTER TABLE vendor_settings
  ADD COLUMN IF NOT EXISTS custom_dietary_tags jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN vendor_settings.custom_dietary_tags IS 'JSON array of {code, label} for vendor-defined dietary tags (codes snake_case, unique per shop)';
