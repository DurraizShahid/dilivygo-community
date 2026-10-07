-- Keep organization_id in sync on INSERT/UPDATE when application code omits it
-- (denormalized from workspace or parent row).

CREATE OR REPLACE FUNCTION trg_set_org_from_project_ref()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.project_ref IS NOT NULL AND length(trim(NEW.project_ref)) > 0 THEN
    SELECT w.organization_id INTO NEW.organization_id FROM workspaces w WHERE w.project_ref = NEW.project_ref LIMIT 1;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_vendor_settings_org()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.shop_id IS NOT NULL THEN
    SELECT s.organization_id INTO NEW.organization_id FROM shops s WHERE s.id = NEW.shop_id LIMIT 1;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_order_items_org()
RETURNS TRIGGER AS $$
BEGIN
  SELECT o.organization_id INTO NEW.organization_id FROM orders o WHERE o.id = NEW.order_id LIMIT 1;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_deliveries_org()
RETURNS TRIGGER AS $$
BEGIN
  SELECT o.organization_id INTO NEW.organization_id FROM orders o WHERE o.id = NEW.order_id LIMIT 1;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_tips_ratings_promo_redemptions_org()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    SELECT o.organization_id INTO NEW.organization_id FROM orders o WHERE o.id = NEW.order_id LIMIT 1;
  END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_cart_items_org()
RETURNS TRIGGER AS $$
BEGIN
  SELECT cs.organization_id INTO NEW.organization_id FROM cart_sessions cs WHERE cs.id = NEW.session_id LIMIT 1;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_messages_org()
RETURNS TRIGGER AS $$
BEGIN
  SELECT c.organization_id INTO NEW.organization_id FROM conversations c WHERE c.id = NEW.conversation_id LIMIT 1;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_modifier_groups_org()
RETURNS TRIGGER AS $$
BEGIN
  SELECT p.organization_id INTO NEW.organization_id FROM products p WHERE p.id = NEW.product_id LIMIT 1;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_order_item_modifiers_org()
RETURNS TRIGGER AS $$
BEGIN
  SELECT oi.organization_id INTO NEW.organization_id FROM order_items oi WHERE oi.id = NEW.order_item_id LIMIT 1;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_user_shops_org()
RETURNS TRIGGER AS $$
BEGIN
  SELECT s.organization_id INTO NEW.organization_id FROM shops s WHERE s.id = NEW.shop_id LIMIT 1;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_rider_locations_org()
RETURNS TRIGGER AS $$
BEGIN
  SELECT d.organization_id INTO NEW.organization_id FROM deliveries d WHERE d.id = NEW.delivery_id LIMIT 1;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_workspace_hostnames_org()
RETURNS TRIGGER AS $$
BEGIN
  SELECT w.organization_id INTO NEW.organization_id FROM workspaces w WHERE w.id = NEW.workspace_id LIMIT 1;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_customer_addresses_org()
RETURNS TRIGGER AS $$
BEGIN
  SELECT c.organization_id INTO NEW.organization_id FROM customers c WHERE c.id = NEW.customer_id LIMIT 1;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_product_variants_org()
RETURNS TRIGGER AS $$
BEGIN
  SELECT p.organization_id INTO NEW.organization_id FROM products p WHERE p.id = NEW.product_id LIMIT 1;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- project_ref tables
DROP TRIGGER IF EXISTS trg_shops_org ON shops;
CREATE TRIGGER trg_shops_org BEFORE INSERT OR UPDATE ON shops FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_app_users_org ON app_users;
CREATE TRIGGER trg_app_users_org BEFORE INSERT OR UPDATE ON app_users FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_customers_org ON customers;
CREATE TRIGGER trg_customers_org BEFORE INSERT OR UPDATE ON customers FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_orders_org ON orders;
CREATE TRIGGER trg_orders_org BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_products_org ON products;
CREATE TRIGGER trg_products_org BEFORE INSERT OR UPDATE ON products FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_categories_org ON categories;
CREATE TRIGGER trg_categories_org BEFORE INSERT OR UPDATE ON categories FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_cart_sessions_org ON cart_sessions;
CREATE TRIGGER trg_cart_sessions_org BEFORE INSERT OR UPDATE ON cart_sessions FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_block_content_org ON block_content;
CREATE TRIGGER trg_block_content_org BEFORE INSERT OR UPDATE ON block_content FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_conversations_org ON conversations;
CREATE TRIGGER trg_conversations_org BEFORE INSERT OR UPDATE ON conversations FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_push_tokens_org ON push_tokens;
CREATE TRIGGER trg_push_tokens_org BEFORE INSERT OR UPDATE ON push_tokens FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_admin_settings_org ON admin_settings;
CREATE TRIGGER trg_admin_settings_org BEFORE INSERT OR UPDATE ON admin_settings FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_rider_geofences_org ON rider_geofences;
CREATE TRIGGER trg_rider_geofences_org BEFORE INSERT OR UPDATE ON rider_geofences FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_promo_codes_org ON promo_codes;
CREATE TRIGGER trg_promo_codes_org BEFORE INSERT OR UPDATE ON promo_codes FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_refund_requests_org ON refund_requests;
CREATE TRIGGER trg_refund_requests_org BEFORE INSERT OR UPDATE ON refund_requests FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_customer_favorites_org ON customer_favorites;
CREATE TRIGGER trg_customer_favorites_org BEFORE INSERT OR UPDATE ON customer_favorites FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_support_ticket_ratings_org ON support_ticket_ratings;
CREATE TRIGGER trg_support_ticket_ratings_org BEFORE INSERT OR UPDATE ON support_ticket_ratings FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_rider_earnings_org ON rider_earnings;
CREATE TRIGGER trg_rider_earnings_org BEFORE INSERT OR UPDATE ON rider_earnings FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_rider_payouts_org ON rider_payouts;
CREATE TRIGGER trg_rider_payouts_org BEFORE INSERT OR UPDATE ON rider_payouts FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_shop_reviews_org ON shop_reviews;
CREATE TRIGGER trg_shop_reviews_org BEFORE INSERT OR UPDATE ON shop_reviews FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_customer_wallet_ledger_org ON customer_wallet_ledger;
CREATE TRIGGER trg_customer_wallet_ledger_org BEFORE INSERT OR UPDATE ON customer_wallet_ledger FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_vendor_payment_transfers_org ON vendor_payment_transfers;
CREATE TRIGGER trg_vendor_payment_transfers_org BEFORE INSERT OR UPDATE ON vendor_payment_transfers FOR EACH ROW EXECUTE PROCEDURE trg_set_org_from_project_ref();

DROP TRIGGER IF EXISTS trg_vendor_settings_org ON vendor_settings;
CREATE TRIGGER trg_vendor_settings_org BEFORE INSERT OR UPDATE ON vendor_settings FOR EACH ROW EXECUTE PROCEDURE trg_vendor_settings_org();

DROP TRIGGER IF EXISTS trg_order_items_org ON order_items;
CREATE TRIGGER trg_order_items_org BEFORE INSERT OR UPDATE ON order_items FOR EACH ROW EXECUTE PROCEDURE trg_order_items_org();

DROP TRIGGER IF EXISTS trg_deliveries_org ON deliveries;
CREATE TRIGGER trg_deliveries_org BEFORE INSERT OR UPDATE ON deliveries FOR EACH ROW EXECUTE PROCEDURE trg_deliveries_org();

DROP TRIGGER IF EXISTS trg_tips_org ON tips;
CREATE TRIGGER trg_tips_org BEFORE INSERT OR UPDATE ON tips FOR EACH ROW EXECUTE PROCEDURE trg_tips_ratings_promo_redemptions_org();

DROP TRIGGER IF EXISTS trg_ratings_org ON ratings;
CREATE TRIGGER trg_ratings_org BEFORE INSERT OR UPDATE ON ratings FOR EACH ROW EXECUTE PROCEDURE trg_tips_ratings_promo_redemptions_org();

DROP TRIGGER IF EXISTS trg_promo_redemptions_org ON promo_redemptions;
CREATE TRIGGER trg_promo_redemptions_org BEFORE INSERT OR UPDATE ON promo_redemptions FOR EACH ROW EXECUTE PROCEDURE trg_tips_ratings_promo_redemptions_org();

DROP TRIGGER IF EXISTS trg_cart_items_org ON cart_items;
CREATE TRIGGER trg_cart_items_org BEFORE INSERT OR UPDATE ON cart_items FOR EACH ROW EXECUTE PROCEDURE trg_cart_items_org();

DROP TRIGGER IF EXISTS trg_messages_org ON messages;
CREATE TRIGGER trg_messages_org BEFORE INSERT OR UPDATE ON messages FOR EACH ROW EXECUTE PROCEDURE trg_messages_org();

DROP TRIGGER IF EXISTS trg_modifier_groups_org ON modifier_groups;
CREATE TRIGGER trg_modifier_groups_org BEFORE INSERT OR UPDATE ON modifier_groups FOR EACH ROW EXECUTE PROCEDURE trg_modifier_groups_org();

DROP TRIGGER IF EXISTS trg_order_item_modifiers_org ON order_item_modifiers;
CREATE TRIGGER trg_order_item_modifiers_org BEFORE INSERT OR UPDATE ON order_item_modifiers FOR EACH ROW EXECUTE PROCEDURE trg_order_item_modifiers_org();

DROP TRIGGER IF EXISTS trg_user_shops_org ON user_shops;
CREATE TRIGGER trg_user_shops_org BEFORE INSERT OR UPDATE ON user_shops FOR EACH ROW EXECUTE PROCEDURE trg_user_shops_org();

DROP TRIGGER IF EXISTS trg_rider_locations_org ON rider_locations;
CREATE TRIGGER trg_rider_locations_org BEFORE INSERT OR UPDATE ON rider_locations FOR EACH ROW EXECUTE PROCEDURE trg_rider_locations_org();

DROP TRIGGER IF EXISTS trg_workspace_hostnames_org ON workspace_hostnames;
CREATE TRIGGER trg_workspace_hostnames_org BEFORE INSERT OR UPDATE ON workspace_hostnames FOR EACH ROW EXECUTE PROCEDURE trg_workspace_hostnames_org();

DROP TRIGGER IF EXISTS trg_customer_addresses_org ON customer_addresses;
CREATE TRIGGER trg_customer_addresses_org BEFORE INSERT OR UPDATE ON customer_addresses FOR EACH ROW EXECUTE PROCEDURE trg_customer_addresses_org();

DROP TRIGGER IF EXISTS trg_product_variants_org ON product_variants;
CREATE TRIGGER trg_product_variants_org BEFORE INSERT OR UPDATE ON product_variants FOR EACH ROW EXECUTE PROCEDURE trg_product_variants_org();
