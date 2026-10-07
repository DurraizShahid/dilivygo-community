-- Migration: 040_product_modifiers
-- Product modifier groups, options, and order-item-modifier selections.

-- ─── Modifier Groups (e.g. "Size", "Extra Toppings") ─────────────────────────
CREATE TABLE IF NOT EXISTS modifier_groups (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  min_selections INT NOT NULL DEFAULT 0,
  max_selections INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS modifier_groups_product_id_idx ON modifier_groups(product_id);

-- ─── Modifier Options (e.g. "Small +£0", "Large +£2.00") ────────────────────
CREATE TABLE IF NOT EXISTS modifier_options (
  id UUID PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INT NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS modifier_options_group_id_idx ON modifier_options(group_id);

-- ─── Order Item Modifiers (denormalized snapshot of selected modifiers) ──────
CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id UUID PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_option_id UUID,
  group_name TEXT NOT NULL,
  option_name TEXT NOT NULL,
  price_cents INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS order_item_modifiers_order_item_id_idx ON order_item_modifiers(order_item_id);
