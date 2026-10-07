-- =============================================================================
-- Migration: 099_demo_seed
-- Idempotent demo seed data for the Dilivygo local demo environment.
-- Creates the canonical demo organization, workspaces, shops, and infrastructure.
-- This migration is safe to run against any database. It will never touch
-- production data when DEMO_ENVIRONMENT is validated by the seed scripts.
-- =============================================================================

-- ─── 1. Demo Organization ──────────────────────────────────────────────────

INSERT INTO organizations (id, name, public_ref, created_at, updated_at)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Dilivygo Demo Restaurant Group',
  'dilivygo-demo',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public_ref = EXCLUDED.public_ref,
  updated_at = NOW();

-- Secondary isolation tenant for multi-tenancy testing
INSERT INTO organizations (id, name, public_ref, created_at, updated_at)
VALUES (
  'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  'Demo Isolation Tenant',
  'demo-isolation',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public_ref = EXCLUDED.public_ref,
  updated_at = NOW();

-- ─── 2. Organization Members ───────────────────────────────────────────────

-- This will be populated by demo:link-clerk which resolves the actual Clerk user ID.
-- For now, create the placeholder that can be updated safely.
INSERT INTO organization_members (id, organization_id, clerk_user_id, role, created_at)
VALUES (
  'c3d4e5f6-a7b8-9012-cdef-123456789012',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'placeholder-demo-clerk-user',
  'owner',
  NOW()
)
ON CONFLICT (organization_id, clerk_user_id) DO NOTHING;

-- ─── 3. Workspaces ─────────────────────────────────────────────────────────

-- Crust & Flame — F-7
INSERT INTO workspaces (id, project_ref, name, description, address, phone, lat, lon, organization_id, saas_staff_bootstrap_completed, created_at, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'crust-flame-f7',
  'Crust & Flame — F-7',
  'Flagship branch in the city center. Our most popular location.',
  '42 High Street, London EC1A 1AA',
  '+44 20 7946 0958',
  51.5208,
  -0.1558,
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (project_ref) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  address = EXCLUDED.address,
  phone = EXCLUDED.phone,
  lat = EXCLUDED.lat,
  lon = EXCLUDED.lon,
  organization_id = EXCLUDED.organization_id,
  saas_staff_bootstrap_completed = true,
  updated_at = NOW();

-- Crust & Flame — DHA
INSERT INTO workspaces (id, project_ref, name, description, address, phone, lat, lon, organization_id, saas_staff_bootstrap_completed, created_at, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  'crust-flame-dha',
  'Crust & Flame — DHA',
  'DHA branch serving the DHA area with our signature menu.',
  '125 Main Boulevard, DHA Phase 8',
  '+44 20 7946 0959',
  51.5180,
  -0.1700,
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (project_ref) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  address = EXCLUDED.address,
  phone = EXCLUDED.phone,
  lat = EXCLUDED.lat,
  lon = EXCLUDED.lon,
  organization_id = EXCLUDED.organization_id,
  saas_staff_bootstrap_completed = true,
  updated_at = NOW();

-- Crust & Flame — Bahria
INSERT INTO workspaces (id, project_ref, name, description, address, phone, lat, lon, organization_id, saas_staff_bootstrap_completed, created_at, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  'crust-flame-bahria',
  'Crust & Flame — Bahria',
  'Bahria branch known for our fried chicken specials.',
  '78 Bahria Town Avenue, Bahria Town',
  '+44 20 7946 0960',
  51.5250,
  -0.1400,
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (project_ref) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  address = EXCLUDED.address,
  phone = EXCLUDED.phone,
  lat = EXCLUDED.lat,
  lon = EXCLUDED.lon,
  organization_id = EXCLUDED.organization_id,
  saas_staff_bootstrap_completed = true,
  updated_at = NOW();

-- Crust & Flame — Gulberg
INSERT INTO workspaces (id, project_ref, name, description, address, phone, lat, lon, organization_id, saas_staff_bootstrap_completed, created_at, updated_at)
VALUES (
  '10000000-0000-0000-0000-000000000004',
  'crust-flame-gulberg',
  'Crust & Flame — Gulberg',
  'Gulberg branch offering our full menu including family meals.',
  '33 Gulberg Main Road, Gulberg III',
  '+44 20 7946 0961',
  51.5300,
  -0.1300,
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (project_ref) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  address = EXCLUDED.address,
  phone = EXCLUDED.phone,
  lat = EXCLUDED.lat,
  lon = EXCLUDED.lon,
  organization_id = EXCLUDED.organization_id,
  saas_staff_bootstrap_completed = true,
  updated_at = NOW();

-- ─── 4. Update workspaces that had no organization_id ──────────────────────

UPDATE workspaces
SET organization_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
WHERE organization_id IS NULL AND project_ref IN ('crust-flame-f7', 'crust-flame-dha', 'crust-flame-bahria', 'crust-flame-gulberg');

-- ─── 5. Platform Settings for Demo ─────────────────────────────────────────

INSERT INTO organization_platform_settings (organization_id, key, value, updated_at)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'default_currency', 'gbp', NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'demo_mode', 'true', NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'customer_wallet_enabled', 'true', NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'refund_requests_enabled', 'true', NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'reviews_enabled', 'true', NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'cutlery_enabled', 'true', NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'delivery_radius_km', '15', NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'auto_dispatch_delay_minutes', '5', NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'avg_delivery_time_minutes', '30', NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'max_search_radius_km', '15', NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'language', 'en', NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'theme', '{"primaryColor":"#E85423","secondaryColor":"#FF6B35","accentColor":"#FFB800","logoUrl":"/logo.svg"}', NOW())
ON CONFLICT (organization_id, key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- ─── 6. Notification Templates ─────────────────────────────────────────────

INSERT INTO notification_templates (organization_id, slug, name, description, channel, email_subject, push_title, push_body, created_at, updated_at)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'order_confirmed_demo', 'Order Confirmed', 'Your order from {{shop_name}} is confirmed!', 'push', NULL, 'Order Confirmed', 'Hi {{customer_name}}, your order #{{order_number}} has been placed. Total: {{total}}. We''ll notify you when it''s ready.', NOW(), NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'order_ready_demo', 'Order Ready', 'Your order is ready!', 'push', NULL, 'Order Ready', 'Great news! Your order #{{order_number}} from {{shop_name}} is ready for {{delivery_method}}.', NOW(), NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'delivery_update_demo', 'Delivery Update', 'Delivery update for order #{{order_number}}', 'push', NULL, 'Delivery Update', 'Your order is {{status}}. {{rider_name}} is on the way!', NOW(), NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'promotion_demo', 'Promotion Alert', '{{promotion_name}} — Limited Time!', 'push', NULL, '{{promotion_name}} — Limited Time!', '{{promotion_description}} Use code: {{promo_code}}', NOW(), NOW()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'review_request_demo', 'Review Request', 'How was your experience?', 'push', NULL, 'Review Request', 'We loved serving you! Leave a review and earn {{reward_amount}} in credits.', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ─── 7. Platform Branding ──────────────────────────────────────────────────

INSERT INTO platform_banners (id, organization_id, title, subtitle, image_url, placement, sort_order, is_active, created_at, updated_at)
VALUES
  ('d1e2f3a4-b5c6-7890-abcd-ef1234567891', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Weekend Special', '20% off all burgers this weekend!', '/images/banners/weekend-special.jpg', 'home_promotions', 1, true, NOW(), NOW()),
  ('d1e2f3a4-b5c6-7890-abcd-ef1234567892', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Free Delivery', 'Free delivery on orders over £15', '/images/banners/free-delivery.jpg', 'home_promotions', 2, true, NOW(), NOW()),
  ('d1e2f3a4-b5c6-7890-abcd-ef1234567893', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'New Branch Opening', 'Visit our new Gulberg branch!', '/images/banners/new-branch.jpg', 'home_promotions', 3, true, NOW(), NOW()),
  ('d1e2f3a4-b5c6-7890-abcd-ef1234567894', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Smash Burger Campaign', 'Try our signature smash burgers', '/images/banners/smash-campaign.jpg', 'home_explore_deals', 1, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── 8. Demo Shops ──────────────────────────────────────────────────────────

-- The shops trigger (trg_set_org_from_project_ref) fills organization_id
-- from the workspaces seeded above, so we only need project_ref + basics.
INSERT INTO shops (id, project_ref, name, slug, description, address, phone, lat, lon, currency, is_active, created_at, updated_at)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'crust-flame-f7', 'Crust & Flame — F-7', 'crust-flame-f7', 'Flagship branch in the city center. Our most popular location.', '42 High Street, London EC1A 1AA', '+44 20 7946 0958', 51.5208, -0.1558, 'gbp', true, NOW(), NOW()),
  ('20000000-0000-0000-0000-000000000002', 'crust-flame-dha', 'Crust & Flame — DHA', 'crust-flame-dha', 'DHA branch serving the DHA area with our signature menu.', '125 Main Boulevard, DHA Phase 8', '+44 20 7946 0959', 51.5180, -0.1700, 'gbp', true, NOW(), NOW()),
  ('20000000-0000-0000-0000-000000000003', 'crust-flame-bahria', 'Crust & Flame — Bahria', 'crust-flame-bahria', 'Bahria branch known for our fried chicken specials.', '78 Bahria Town Avenue, Bahria Town', '+44 20 7946 0960', 51.5250, -0.1400, 'gbp', true, NOW(), NOW()),
  ('20000000-0000-0000-0000-000000000004', 'crust-flame-gulberg', 'Crust & Flame — Gulberg', 'crust-flame-gulberg', 'Gulberg branch offering our full menu including family meals.', '33 Gulberg Main Road, Gulberg III', '+44 20 7946 0961', 51.5300, -0.1300, 'gbp', true, NOW(), NOW())
ON CONFLICT (project_ref, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  address = EXCLUDED.address,
  phone = EXCLUDED.phone,
  lat = EXCLUDED.lat,
  lon = EXCLUDED.lon,
  currency = EXCLUDED.currency,
  is_active = true,
  updated_at = NOW();

-- ─── 8b. Vendor settings for demo shops ─────────────────────────────────────

-- The vendor_settings trigger (trg_vendor_settings_org) fills organization_id
-- from the shop. Every demo shop gets its own settings row (shop_id UNIQUE).
INSERT INTO vendor_settings (id, project_ref, shop_id, auto_accept, default_prep_time_minutes, delivery_mode, delivery_radius_km, minimum_order_cents, created_at, updated_at)
VALUES
  ('30000000-0000-0000-0000-000000000001', 'crust-flame-f7', '20000000-0000-0000-0000-000000000001', true, 20, 'third_party', 15, 500, NOW(), NOW()),
  ('30000000-0000-0000-0000-000000000002', 'crust-flame-dha', '20000000-0000-0000-0000-000000000002', true, 20, 'third_party', 15, 500, NOW(), NOW()),
  ('30000000-0000-0000-0000-000000000003', 'crust-flame-bahria', '20000000-0000-0000-0000-000000000003', true, 20, 'third_party', 15, 500, NOW(), NOW()),
  ('30000000-0000-0000-0000-000000000004', 'crust-flame-gulberg', '20000000-0000-0000-0000-000000000004', true, 20, 'third_party', 15, 500, NOW(), NOW())
ON CONFLICT (shop_id) DO UPDATE SET
  project_ref = EXCLUDED.project_ref,
  auto_accept = EXCLUDED.auto_accept,
  default_prep_time_minutes = EXCLUDED.default_prep_time_minutes,
  delivery_mode = EXCLUDED.delivery_mode,
  delivery_radius_km = EXCLUDED.delivery_radius_km,
  minimum_order_cents = EXCLUDED.minimum_order_cents,
  updated_at = NOW();

-- ─── 9. Demo Mode Flag ─────────────────────────────────────────────────────

-- Ensure platform_settings.demo_mode is set (platform-level key)
INSERT INTO platform_settings (key, value, updated_at)
VALUES ('demo_mode', 'true', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- =============================================================================
-- End of migration 099_demo_seed
-- =============================================================================
