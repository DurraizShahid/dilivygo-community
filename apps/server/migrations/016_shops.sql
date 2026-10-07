-- Migration: 016_shops
-- Introduces multi-shop support: vendors (workspaces) can own multiple shops/branches.
-- Each shop has its own catalog, orders, settings, and staff assignments.

-- ─── Shops table ──────────────────────────────────────────────────────────────
create table if not exists shops (
  id uuid primary key,
  project_ref text not null,
  name text not null,
  slug text not null,
  description text,
  logo_url text,
  banner_url text,
  address text,
  phone text,
  lat decimal(10, 8),
  lon decimal(11, 8),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_ref, slug)
);
create index if not exists shops_project_ref_idx on shops(project_ref);
create index if not exists shops_slug_idx on shops(project_ref, slug);
create index if not exists shops_is_active_idx on shops(is_active);

-- ─── User-shop assignments (staff scoping) ────────────────────────────────────
create table if not exists user_shops (
  id uuid primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  shop_id uuid not null references shops(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, shop_id)
);
create index if not exists user_shops_user_id_idx on user_shops(user_id);
create index if not exists user_shops_shop_id_idx on user_shops(shop_id);

-- ─── Add shop_id to existing tables ──────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS shop_id uuid references shops(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS shop_id uuid references shops(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shop_id uuid references shops(id);
ALTER TABLE cart_sessions ADD COLUMN IF NOT EXISTS shop_id uuid references shops(id);
ALTER TABLE vendor_settings ADD COLUMN IF NOT EXISTS shop_id uuid references shops(id);

-- Indexes for shop_id
create index if not exists products_shop_id_idx on products(shop_id);
create index if not exists categories_shop_id_idx on categories(shop_id);
create index if not exists orders_shop_id_idx on orders(shop_id);
create index if not exists cart_sessions_shop_id_idx on cart_sessions(shop_id);
create index if not exists vendor_settings_shop_id_idx on vendor_settings(shop_id);

-- ─── Backfill: create a default shop for each existing workspace ─────────────
INSERT INTO shops (id, project_ref, name, slug, description, logo_url, banner_url, address, phone, lat, lon, is_active, created_at, updated_at)
SELECT
  gen_random_uuid(),
  w.project_ref,
  w.name,
  'main',
  w.description,
  w.logo_url,
  w.banner_url,
  w.address,
  w.phone,
  w.lat,
  w.lon,
  true,
  w.created_at,
  w.updated_at
FROM workspaces w
WHERE NOT EXISTS (SELECT 1 FROM shops s WHERE s.project_ref = w.project_ref)
ON CONFLICT (project_ref, slug) DO NOTHING;

-- Backfill shop_id on products
UPDATE products SET shop_id = s.id
FROM shops s
WHERE products.project_ref = s.project_ref AND s.slug = 'main' AND products.shop_id IS NULL;

-- Backfill shop_id on categories
UPDATE categories SET shop_id = s.id
FROM shops s
WHERE categories.project_ref = s.project_ref AND s.slug = 'main' AND categories.shop_id IS NULL;

-- Backfill shop_id on orders
UPDATE orders SET shop_id = s.id
FROM shops s
WHERE orders.project_ref = s.project_ref AND s.slug = 'main' AND orders.shop_id IS NULL;

-- Backfill shop_id on cart_sessions
UPDATE cart_sessions SET shop_id = s.id
FROM shops s
WHERE cart_sessions.project_ref = s.project_ref AND s.slug = 'main' AND cart_sessions.shop_id IS NULL;

-- Backfill shop_id on vendor_settings
UPDATE vendor_settings SET shop_id = s.id
FROM shops s
WHERE vendor_settings.project_ref = s.project_ref AND s.slug = 'main' AND vendor_settings.shop_id IS NULL;

-- Change vendor_settings unique constraint from project_ref to shop_id
ALTER TABLE vendor_settings DROP CONSTRAINT IF EXISTS vendor_settings_project_ref_key;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_settings_shop_id_key'
  ) THEN
    ALTER TABLE vendor_settings ADD CONSTRAINT vendor_settings_shop_id_key UNIQUE (shop_id);
  END IF;
END $$;

-- Assign all existing vendor users to the default shop of their project_ref
INSERT INTO user_shops (id, user_id, shop_id, created_at)
SELECT gen_random_uuid(), u.id, s.id, now()
FROM app_users u
JOIN shops s ON s.project_ref = u.project_ref AND s.slug = 'main'
WHERE u.role = 'vendor'
AND NOT EXISTS (SELECT 1 FROM user_shops us WHERE us.user_id = u.id AND us.shop_id = s.id);
