-- Migration: 054_global_marketplace
-- Global marketplace: one customer identity per phone per deployment; optional workspace for riders;
-- favorites unique by customer + shop/product; rider geofence project_ref nullable.

-- ─── Dedupe customers by phone (keep oldest row per phone) ────────────────────
CREATE TEMP TABLE IF NOT EXISTS _customer_keepers AS
SELECT DISTINCT ON (phone)
  id AS keeper_id,
  phone
FROM customers
ORDER BY phone, created_at ASC NULLS LAST, id ASC;

UPDATE orders o
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers k ON c.phone = k.phone AND c.id <> k.keeper_id
WHERE o.customer_id = c.id;

UPDATE cart_sessions s
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers k ON c.phone = k.phone AND c.id <> k.keeper_id
WHERE s.customer_id = c.id;

UPDATE customer_addresses a
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers k ON c.phone = k.phone AND c.id <> k.keeper_id
WHERE a.customer_id = c.id;

UPDATE customer_favorites f
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers k ON c.phone = k.phone AND c.id <> k.keeper_id
WHERE f.customer_id = c.id;

UPDATE shop_reviews r
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers k ON c.phone = k.phone AND c.id <> k.keeper_id
WHERE r.customer_id = c.id;

UPDATE promo_redemptions pr
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers k ON c.phone = k.phone AND c.id <> k.keeper_id
WHERE pr.customer_id = c.id;

UPDATE support_ticket_ratings str
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers k ON c.phone = k.phone AND c.id <> k.keeper_id
WHERE str.customer_id = c.id;

DELETE FROM customers c
USING _customer_keepers k
WHERE c.phone = k.phone AND c.id <> k.keeper_id;

DROP TABLE IF EXISTS _customer_keepers;

DROP INDEX IF EXISTS customers_project_ref_phone_uq;

ALTER TABLE customers ALTER COLUMN project_ref DROP NOT NULL;

UPDATE customers SET project_ref = NULL WHERE project_ref IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_phone_uq ON customers (phone);

-- ─── Staff: riders may have no workspace (platform / Uber-style pool) ─────────
ALTER TABLE app_users ALTER COLUMN project_ref DROP NOT NULL;

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_workspace_required_chk;
ALTER TABLE app_users ADD CONSTRAINT app_users_workspace_required_chk
  CHECK (
    role = 'rider'
    OR (project_ref IS NOT NULL AND length(trim(project_ref)) > 0)
  );

-- ─── Rider geofences: allow NULL project_ref for platform riders ─────────────
ALTER TABLE rider_geofences ALTER COLUMN project_ref DROP NOT NULL;

-- ─── Favorites: unique per customer + shop/product (shop_id / product_id global UUIDs)
DROP INDEX IF EXISTS uq_customer_favorites_shop;
DROP INDEX IF EXISTS uq_customer_favorites_product;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_favorites_shop
  ON customer_favorites (customer_id, shop_id)
  WHERE kind = 'shop' AND shop_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_favorites_product
  ON customer_favorites (customer_id, product_id)
  WHERE kind = 'product' AND product_id IS NOT NULL;
