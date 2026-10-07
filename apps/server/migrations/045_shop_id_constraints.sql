-- Migration: 045_shop_id_constraints
-- Enforces NOT NULL constraints on shop_id columns and updates category uniqueness.
-- Tasks 6 & 7: shop_id is now mandatory; category uniqueness scoped to shop.

-- ─── Clean up orphaned records ──────────────────────────────────────────────
-- Delete any rows where shop_id is NULL. These are legacy orphaned records
-- that were not backfilled during the 016_shops migration (no matching workspace).
-- They have no shop association and cannot be displayed to users anyway.

DELETE FROM products WHERE shop_id IS NULL;
DELETE FROM categories WHERE shop_id IS NULL;
DELETE FROM orders WHERE shop_id IS NULL;

-- ─── Add NOT NULL constraints to shop_id columns ────────────────────────────
-- Now that orphaned records are removed, enforce shop_id as required.

ALTER TABLE products ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE categories ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE orders ALTER COLUMN shop_id SET NOT NULL;

-- ─── Update category unique constraint to scope by shop_id ──────────────────
-- Previously categories were unique per (project_ref, name).
-- Now they should be unique per (shop_id, name) since shops own their catalogs.

DROP INDEX IF EXISTS categories_project_ref_name_uq;
CREATE UNIQUE INDEX IF NOT EXISTS categories_shop_id_name_uq ON categories(shop_id, name);
