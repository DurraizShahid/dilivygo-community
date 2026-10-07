-- Phase 11 order-channel / POS-channel mapping tables (scaffold storage).
--
-- Purpose: canonical external-ID mapping for cloud order-channel providers
-- (Blink, Indolj, ePOSmatic; Technosis BlueLink stays identity-blocked with no
-- rows). Kit global rule §19: external ids NEVER become internal primary keys —
-- every table below carries its own UUID PK plus the provider's external id as
-- DATA, with UNIQUE (organization_id, provider_key, external_*) scoping so a
-- redelivered provider event is idempotent per tenant.
--
-- Tables:
--   order_channel_branch_mappings  org/provider/external-branch-id -> shop
--   order_channel_product_mappings org/provider/external-product-id (+variant)
--                                    -> product (+variant)
--   order_channel_orders           org/provider/external-order-id -> order,
--                                    plus last-known external status, last
--                                    provider event id, and needs_review flag
--                                    for unknown-SKU holds.
--
-- Raw provider payloads are NOT stored here: they live in the Phase 02 durable
-- inbox `integration_webhook_events` (migration 112). Provider secrets are NOT
-- stored here either: credentials stay server-side (Nango / encrypted
-- connection metadata) per kit rule §6.
--
-- Rollout / backfill: brand-new tables, no backfill (no prior channel rows
-- exist — Phase 00 inventory confirms zero hits for all four providers).
-- Rollback: DROP TABLE IF EXISTS in reverse order (mappings reference shops /
-- products / orders with ON DELETE SET NULL / CASCADE documented below; no
-- production data depends on these tables yet).
-- Runner: created only — NEVER run automatically; apply with
-- `npm run migrate --workspace=dilivygo-backend` where DB credentials exist.

CREATE TABLE IF NOT EXISTS order_channel_branch_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL
    CONSTRAINT order_channel_branch_mappings_provider_check
    CHECK (provider_key IN ('blink', 'indolj', 'eposmatic', 'technosis-bluelink')),
  external_branch_id TEXT NOT NULL,
  shop_id UUID NULL REFERENCES shops(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_channel_branch_mappings_org_provider_branch_unique
    UNIQUE (organization_id, provider_key, external_branch_id)
);

CREATE INDEX IF NOT EXISTS order_channel_branch_mappings_org_idx
  ON order_channel_branch_mappings (organization_id, provider_key);

CREATE TABLE IF NOT EXISTS order_channel_product_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL
    CONSTRAINT order_channel_product_mappings_provider_check
    CHECK (provider_key IN ('blink', 'indolj', 'eposmatic', 'technosis-bluelink')),
  external_product_id TEXT NOT NULL,
  -- Empty string when the provider item has no variant: keeps the UNIQUE
  -- below effective (Postgres treats NULLs as distinct in unique indexes).
  external_variant_id TEXT NOT NULL DEFAULT '',
  product_id UUID NULL REFERENCES products(id) ON DELETE SET NULL,
  product_variant_id UUID NULL REFERENCES product_variants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_channel_product_mappings_org_provider_product_unique
    UNIQUE (organization_id, provider_key, external_product_id, external_variant_id)
);

CREATE INDEX IF NOT EXISTS order_channel_product_mappings_org_idx
  ON order_channel_product_mappings (organization_id, provider_key);

CREATE TABLE IF NOT EXISTS order_channel_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL
    CONSTRAINT order_channel_orders_provider_check
    CHECK (provider_key IN ('blink', 'indolj', 'eposmatic', 'technosis-bluelink')),
  external_order_id TEXT NOT NULL,
  -- Internal order row: its own UUID PK, created by the order service AFTER
  -- ingest. NULL until the internal order exists; the external id NEVER fills
  -- this column (rule §19). SET NULL keeps channel history if the order row
  -- is removed by a data-retention process.
  order_id UUID NULL REFERENCES orders(id) ON DELETE SET NULL,
  shop_id UUID NULL REFERENCES shops(id) ON DELETE SET NULL,
  external_status TEXT NULL,
  last_provider_event_id TEXT NULL,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_channel_orders_org_provider_order_unique
    UNIQUE (organization_id, provider_key, external_order_id)
);

CREATE INDEX IF NOT EXISTS order_channel_orders_org_idx
  ON order_channel_orders (organization_id, provider_key);

-- Idempotency / ops lookup: find the internal order for a redelivered event.
CREATE INDEX IF NOT EXISTS order_channel_orders_internal_order_idx
  ON order_channel_orders (order_id)
  WHERE order_id IS NOT NULL;

-- Review queue: unknown-SKU holds awaiting operator mapping.
CREATE INDEX IF NOT EXISTS order_channel_orders_needs_review_idx
  ON order_channel_orders (organization_id, provider_key)
  WHERE needs_review = true;
