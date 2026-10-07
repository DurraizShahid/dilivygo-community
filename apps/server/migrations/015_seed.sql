-- Migration: 015_seed
-- Idempotent demo seed data for local/dev.
-- NOTE: uses fixed UUIDs for stable references.

-- Demo workspace / tenant
insert into workspaces (
  id, project_ref, name, description, address, phone, lat, lon, created_at, updated_at
)
values (
  '11111111-1111-1111-1111-111111111111',
  'demo',
  'Demo Restaurant',
  'A seeded workspace for development/testing.',
  '1 Demo Street, London',
  '+44 7700 900000',
  51.5074,
  -0.1278,
  now(),
  now()
)
on conflict (project_ref) do update set
  name = excluded.name,
  description = excluded.description,
  address = excluded.address,
  phone = excluded.phone,
  lat = excluded.lat,
  lon = excluded.lon,
  updated_at = now();

-- Seed admin settings singleton (one row)
insert into admin_settings (
  id, avg_delivery_time_minutes, auto_dispatch_delay_minutes, max_search_radius_km, created_at, updated_at
)
values (
  '22222222-2222-2222-2222-222222222222',
  30,
  5,
  15.0,
  now(),
  now()
)
on conflict (id) do update set
  avg_delivery_time_minutes = excluded.avg_delivery_time_minutes,
  auto_dispatch_delay_minutes = excluded.auto_dispatch_delay_minutes,
  max_search_radius_km = excluded.max_search_radius_km,
  updated_at = now();

-- Seed vendor settings for demo workspace
insert into vendor_settings (
  id, project_ref, auto_accept, default_prep_time_minutes, delivery_mode, delivery_radius_km, auto_dispatch_delay_minutes, created_at, updated_at
)
values (
  '33333333-3333-3333-3333-333333333333',
  'demo',
  false,
  20,
  'third_party',
  5.0,
  0,
  now(),
  now()
)
on conflict (project_ref) do update set
  auto_accept = excluded.auto_accept,
  default_prep_time_minutes = excluded.default_prep_time_minutes,
  delivery_mode = excluded.delivery_mode,
  delivery_radius_km = excluded.delivery_radius_km,
  auto_dispatch_delay_minutes = excluded.auto_dispatch_delay_minutes,
  updated_at = now();

-- Seed staff accounts (admin/vendor/rider)
-- Passwords:
--   admin@demo.com  -> Admin123!
--   vendor@demo.com -> Vendor123!
--   rider@demo.com  -> Rider123!
insert into app_users (id, email, password_hash, role, project_ref, totp_enabled, created_at)
values
  (
    '44444444-4444-4444-4444-444444444444',
    'admin@demo.com',
    '$2b$12$9BKrkXaF7YQhDmNcIew/A.XPA9R9Ry.iulrED4M2WX6Ld7s9PFopW',
    'admin',
    'demo',
    false,
    now()
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'vendor@demo.com',
    '$2b$12$ASkMbkuoQwrwb.6h4Xqkd.dHWPzQhJNaJEPQFgtBRzBLs1Kjz7GUS',
    'vendor',
    'demo',
    false,
    now()
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    'rider@demo.com',
    '$2b$12$j2ofgbA02gDxyb8jV/OYFOUqL0EbIN9CJYZUfbunAgmGS0RGxpsSS',
    'rider',
    'demo',
    false,
    now()
  )
on conflict (lower(email)) do update set
  password_hash = excluded.password_hash,
  role = excluded.role,
  project_ref = excluded.project_ref;

-- Seed a demo customer (OTP login uses phone)
insert into customers (id, phone, name, email, project_ref, created_at, updated_at)
values (
  '77777777-7777-7777-7777-777777777777',
  '+447700900001',
  'Demo Customer',
  'customer@demo.com',
  'demo',
  now(),
  now()
)
on conflict (project_ref, phone) do update set
  name = excluded.name,
  email = excluded.email,
  updated_at = now();

-- Seed categories + products for demo workspace
insert into categories (id, project_ref, name, sort_order, created_at, updated_at)
values
  ('88888888-8888-8888-8888-888888888888', 'demo', 'Burgers', 1, now(), now()),
  ('99999999-9999-9999-9999-999999999999', 'demo', 'Drinks', 2, now(), now())
on conflict (project_ref, name) do update set
  sort_order = excluded.sort_order,
  updated_at = now();

insert into products (
  id, project_ref, name, description, price_cents, category, image_url, available, sort_order, created_at, updated_at
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'demo',
    'Classic Burger',
    'Beef patty, lettuce, tomato, burger sauce.',
    1099,
    'Burgers',
    null,
    true,
    1,
    now(),
    now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'demo',
    'Fries',
    'Crispy salted fries.',
    349,
    'Burgers',
    null,
    true,
    2,
    now(),
    now()
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'demo',
    'Cola',
    '330ml can.',
    199,
    'Drinks',
    null,
    true,
    1,
    now(),
    now()
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  category = excluded.category,
  image_url = excluded.image_url,
  available = excluded.available,
  sort_order = excluded.sort_order,
  updated_at = now();

