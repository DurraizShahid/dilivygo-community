-- Per-line shop, notes, modifiers, and session currency for account-backed cart sync.

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS shop_id uuid REFERENCES shops(id);
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS selected_modifiers jsonb;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS line_project_ref text;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS shop_name text;

ALTER TABLE cart_sessions ADD COLUMN IF NOT EXISTS currency text;

CREATE INDEX IF NOT EXISTS cart_items_shop_id_idx ON cart_items(shop_id);
