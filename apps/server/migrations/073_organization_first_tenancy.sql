-- Organization-first tenancy: every workspace belongs to an organization;
-- denormalize organization_id onto tenant tables; remove tenant keys from platform_settings
-- (they live only in organization_platform_settings). Global platform_settings retains
-- deployment-only keys (e.g. demo_mode).

-- ─── 1. Synthetic org for marketplace-scoped rows (NULL project_ref identities) ─
INSERT INTO organizations (id, name, created_at, updated_at)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Platform marketplace (cross-workspace identities)',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM organizations WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
);

-- ─── 2. Ensure every workspace has an organization ─────────────────────────────
DO $$
DECLARE
  r RECORD;
  v_org UUID;
BEGIN
  FOR r IN SELECT id, project_ref FROM workspaces WHERE organization_id IS NULL LOOP
    v_org := gen_random_uuid();
    INSERT INTO organizations (id, name, created_at, updated_at)
    VALUES (v_org, 'Organization (' || r.project_ref || ')', NOW(), NOW());
    UPDATE workspaces SET organization_id = v_org, updated_at = NOW() WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE workspaces ALTER COLUMN organization_id SET NOT NULL;

-- ─── 3. Merge tenant keys from platform_settings into every org, then drop globals ─
INSERT INTO organization_platform_settings (organization_id, key, value, updated_at)
SELECT o.id, p.key, p.value, NOW()
FROM organizations o
CROSS JOIN platform_settings p
WHERE p.key IS DISTINCT FROM 'demo_mode'
ON CONFLICT (organization_id, key) DO UPDATE
SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;

DELETE FROM platform_settings WHERE key IS DISTINCT FROM 'demo_mode';

-- ─── 4. Add organization_id column (FK) to tenant tables ───────────────────────
ALTER TABLE shops ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE cart_sessions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE block_content ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE rider_geofences ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE refund_requests ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE customer_favorites ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE support_ticket_ratings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE rider_earnings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE rider_payouts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE shop_reviews ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE customer_wallet_ledger ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE vendor_payment_transfers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE vendor_settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE tips ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE promo_redemptions ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE customer_addresses ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE modifier_groups ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE order_item_modifiers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE user_shops ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE rider_locations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
ALTER TABLE workspace_hostnames ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;

-- platform_themes (legacy) — optional workspace_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_themes'
  ) THEN
    ALTER TABLE platform_themes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ─── 5. Backfill from workspaces (project_ref → organization_id) ───────────────
UPDATE shops s SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = s.project_ref AND s.organization_id IS NULL;
UPDATE orders o SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = o.project_ref AND o.organization_id IS NULL;
UPDATE products p SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = p.project_ref AND p.organization_id IS NULL;
UPDATE categories c SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = c.project_ref AND c.organization_id IS NULL;
UPDATE cart_sessions cs SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = cs.project_ref AND cs.organization_id IS NULL;
UPDATE block_content b SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = b.project_ref AND b.organization_id IS NULL;
UPDATE conversations c SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = c.project_ref AND c.organization_id IS NULL;
UPDATE push_tokens pt SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = pt.project_ref AND pt.organization_id IS NULL;
UPDATE admin_settings a SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = a.project_ref AND a.organization_id IS NULL;
UPDATE refund_requests r SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = r.project_ref AND r.organization_id IS NULL;
UPDATE customer_favorites f SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = f.project_ref AND f.organization_id IS NULL;
UPDATE support_ticket_ratings str SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = str.project_ref AND str.organization_id IS NULL;
UPDATE rider_earnings re SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = re.project_ref AND re.organization_id IS NULL;
UPDATE rider_payouts rp SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = rp.project_ref AND rp.organization_id IS NULL;
UPDATE shop_reviews sr SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = sr.project_ref AND sr.organization_id IS NULL;
UPDATE vendor_payment_transfers vpt SET organization_id = w.organization_id FROM workspaces w WHERE w.project_ref = vpt.project_ref AND vpt.organization_id IS NULL;
UPDATE promo_codes pc SET organization_id = w.organization_id FROM workspaces w WHERE pc.project_ref IS NOT NULL AND w.project_ref = pc.project_ref AND pc.organization_id IS NULL;

UPDATE app_users u SET organization_id = w.organization_id FROM workspaces w
WHERE u.project_ref IS NOT NULL AND length(trim(u.project_ref)) > 0 AND w.project_ref = u.project_ref AND u.organization_id IS NULL;

UPDATE customers c SET organization_id = w.organization_id FROM workspaces w
WHERE c.project_ref IS NOT NULL AND length(trim(c.project_ref)) > 0 AND w.project_ref = c.project_ref AND c.organization_id IS NULL;

UPDATE rider_geofences rg SET organization_id = w.organization_id FROM workspaces w
WHERE rg.project_ref IS NOT NULL AND length(trim(rg.project_ref)) > 0 AND w.project_ref = rg.project_ref AND rg.organization_id IS NULL;

UPDATE vendor_settings vs SET organization_id = s.organization_id FROM shops s WHERE vs.shop_id = s.id AND vs.organization_id IS NULL;

UPDATE product_variants pv SET organization_id = p.organization_id FROM products p WHERE pv.product_id = p.id AND pv.organization_id IS NULL;

UPDATE order_items oi SET organization_id = o.organization_id FROM orders o WHERE oi.order_id = o.id AND oi.organization_id IS NULL;
UPDATE deliveries d SET organization_id = o.organization_id FROM orders o WHERE d.order_id = o.id AND d.organization_id IS NULL;
UPDATE tips t SET organization_id = o.organization_id FROM orders o WHERE t.order_id = o.id AND t.organization_id IS NULL;
UPDATE ratings r SET organization_id = o.organization_id FROM orders o WHERE r.order_id = o.id AND r.organization_id IS NULL;
UPDATE promo_redemptions pr SET organization_id = o.organization_id FROM orders o WHERE pr.order_id = o.id AND pr.organization_id IS NULL;

UPDATE cart_items ci SET organization_id = cs.organization_id FROM cart_sessions cs WHERE ci.session_id = cs.id AND ci.organization_id IS NULL;

UPDATE messages m SET organization_id = c.organization_id FROM conversations c WHERE m.conversation_id = c.id AND m.organization_id IS NULL;

UPDATE modifier_groups mg SET organization_id = p.organization_id FROM products p WHERE mg.product_id = p.id AND mg.organization_id IS NULL;
UPDATE order_item_modifiers oim SET organization_id = oi.organization_id FROM order_items oi WHERE oim.order_item_id = oi.id AND oim.organization_id IS NULL;

UPDATE user_shops us SET organization_id = s.organization_id FROM shops s WHERE us.shop_id = s.id AND us.organization_id IS NULL;

UPDATE customer_addresses ca SET organization_id = c.organization_id FROM customers c WHERE ca.customer_id = c.id AND ca.organization_id IS NULL;

UPDATE rider_locations rl SET organization_id = d.organization_id FROM deliveries d WHERE rl.delivery_id = d.id AND rl.organization_id IS NULL;

UPDATE workspace_hostnames wh SET organization_id = w.organization_id FROM workspaces w WHERE wh.workspace_id = w.id AND wh.organization_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_themes' AND column_name = 'organization_id'
  ) THEN
    UPDATE platform_themes pt SET organization_id = w.organization_id
    FROM workspaces w
    WHERE pt.workspace_id = w.id AND pt.organization_id IS NULL;
  END IF;
END $$;

-- Marketplace org for NULL project_ref rows
UPDATE app_users SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

UPDATE customers SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

UPDATE rider_geofences SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

UPDATE promo_codes SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL AND project_ref IS NULL;

UPDATE customer_wallet_ledger cwl SET organization_id = w.organization_id
FROM workspaces w
WHERE cwl.project_ref IS NOT NULL AND w.project_ref = cwl.project_ref AND cwl.organization_id IS NULL;

UPDATE customer_wallet_ledger SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE organization_id IS NULL;

-- Fallback: any stragglers use marketplace org (data repair)
UPDATE shops SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE orders SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE products SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE categories SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE product_variants SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE cart_sessions SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE block_content SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE conversations SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE messages SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE push_tokens SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE admin_settings SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE refund_requests SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE customer_favorites SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE support_ticket_ratings SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE rider_earnings SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE rider_payouts SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE shop_reviews SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE vendor_payment_transfers SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE vendor_settings SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE order_items SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE deliveries SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE cart_items SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE tips SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE ratings SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE promo_redemptions SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE customer_addresses SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE modifier_groups SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE order_item_modifiers SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE user_shops SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE rider_locations SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
UPDATE workspace_hostnames SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_themes' AND column_name = 'organization_id'
  ) THEN
    UPDATE platform_themes SET organization_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organization_id IS NULL;
  END IF;
END $$;

-- ─── 6. NOT NULL where every row is backfilled ─────────────────────────────────
ALTER TABLE shops ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE app_users ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE customers ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE orders ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE categories ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE product_variants ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE cart_sessions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE block_content ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE conversations ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE push_tokens ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE admin_settings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE rider_geofences ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE promo_codes ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE refund_requests ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE customer_favorites ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE support_ticket_ratings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE rider_earnings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE rider_payouts ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE shop_reviews ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE customer_wallet_ledger ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE vendor_payment_transfers ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE vendor_settings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE deliveries ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE cart_items ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE tips ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE ratings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE promo_redemptions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE customer_addresses ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE modifier_groups ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE order_item_modifiers ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE user_shops ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE rider_locations ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE workspace_hostnames ALTER COLUMN organization_id SET NOT NULL;

-- ─── 7. Indexes for org-scoped queries ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS shops_organization_id_idx ON shops (organization_id);
CREATE INDEX IF NOT EXISTS orders_organization_id_idx ON orders (organization_id);
CREATE INDEX IF NOT EXISTS customers_organization_id_idx ON customers (organization_id);
CREATE INDEX IF NOT EXISTS app_users_organization_id_idx ON app_users (organization_id);
CREATE INDEX IF NOT EXISTS products_organization_id_idx ON products (organization_id);
CREATE INDEX IF NOT EXISTS conversations_organization_id_idx ON conversations (organization_id);

COMMENT ON COLUMN shops.organization_id IS 'Denormalized from workspaces.organization_id via project_ref; required.';
COMMENT ON COLUMN organizations.id IS '00000000-0000-0000-0000-000000000001 = marketplace bucket for cross-workspace identities.';
