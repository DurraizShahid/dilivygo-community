-- Shop browse categories for customer home filters (assigned by superadmin; presets in platform_settings).

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS browse_category_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN shops.browse_category_ids IS 'Array of browse category codes from platform browse_category_presets; drives customer web cuisine chips.';

INSERT INTO platform_settings (key, value)
VALUES (
  'browse_category_presets',
  '[{"code":"pizza","label":"Pizza","sortOrder":10,"icon":"Pizza"},{"code":"burgers","label":"Burgers","sortOrder":20,"icon":"Sandwich"},{"code":"sushi","label":"Sushi","sortOrder":30,"icon":"Fish"},{"code":"healthy","label":"Healthy","sortOrder":40,"icon":"Salad"},{"code":"coffee","label":"Coffee","sortOrder":50,"icon":"Coffee"},{"code":"desserts","label":"Desserts","sortOrder":60,"icon":"IceCream"},{"code":"soup","label":"Soup","sortOrder":70,"icon":"Soup"},{"code":"grill","label":"Grill","sortOrder":80,"icon":"Flame"},{"code":"steak","label":"Steak","sortOrder":90,"icon":"Beef"}]'
)
ON CONFLICT (key) DO NOTHING;
