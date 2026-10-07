-- Migration: 077_organization_marketplace
-- Organization-as-marketplace model (the user's "each org is its own Uber Eats / FoodPanda"):
--
--   • Organizations get a `public_ref` slug used on public customer/rider surfaces
--     (customer/rider URLs resolve to `{org.public_ref}.{surface}.{apex}`, not per-workspace).
--   • Customers become org-scoped: phone + email are unique per (organization_id, …)
--     instead of deployment-wide. Each organization has its own customer base.
--   • Rider availability/WS pools become org-scoped: rows with `project_ref IS NULL`
--     belong to `organization_id` and can take any order inside that org, never cross-org.
--   • New `organization_hostnames` table for per-org custom domains on customer/rider surfaces.
--
-- Backfill strategy:
--   • Each organization's `public_ref` is derived from its earliest workspace `project_ref`
--     (or slugified name as fallback; collisions get a random suffix).
--   • Customers were collapsed to the marketplace bucket by migration 073. We reassign them
--     to the org of their most recent order; customers with no orders stay in the marketplace
--     bucket so the unique index does not fail.
--   • Duplicate (organization_id, phone) rows are deduped by keeping the oldest per phone
--     and remapping order/cart/address/favorite/review rows to the keeper before delete.

-- ─── 1. organizations.public_ref ──────────────────────────────────────────────

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS public_ref TEXT;

-- Backfill from earliest workspace project_ref
UPDATE organizations o
SET public_ref = sub.project_ref
FROM (
  SELECT DISTINCT ON (w.organization_id) w.organization_id, w.project_ref
  FROM workspaces w
  WHERE w.project_ref IS NOT NULL AND length(trim(w.project_ref)) > 0
  ORDER BY w.organization_id, w.created_at ASC NULLS LAST, w.id ASC
) sub
WHERE o.id = sub.organization_id AND o.public_ref IS NULL;

-- Slugify name for orgs with no workspace (e.g. marketplace bucket)
UPDATE organizations
SET public_ref = CASE
  WHEN id = '00000000-0000-0000-0000-000000000001'::uuid THEN '_marketplace'
  ELSE lower(regexp_replace(coalesce(name, 'org'), '[^a-z0-9]+', '-', 'g'))
END
WHERE public_ref IS NULL;

-- Strip leading/trailing hyphens, collapse duplicates
UPDATE organizations
SET public_ref = regexp_replace(regexp_replace(public_ref, '^-+|-+$', '', 'g'), '-+', '-', 'g')
WHERE public_ref IS NOT NULL;

-- Make absolutely sure no nulls/empties remain
UPDATE organizations
SET public_ref = 'org-' || substr(replace(id::text, '-', ''), 1, 10)
WHERE public_ref IS NULL OR length(trim(public_ref)) = 0;

-- Deduplicate: append short uuid suffix for any colliding public_ref
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT public_ref, count(*) AS n
    FROM organizations
    GROUP BY public_ref
    HAVING count(*) > 1
  LOOP
    UPDATE organizations o
    SET public_ref = o.public_ref || '-' || substr(replace(o.id::text, '-', ''), 1, 6)
    WHERE o.public_ref = r.public_ref
      AND o.id <> (
        SELECT id FROM organizations WHERE public_ref = r.public_ref ORDER BY created_at ASC LIMIT 1
      );
  END LOOP;
END $$;

ALTER TABLE organizations ALTER COLUMN public_ref SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_public_ref_uq
  ON organizations (public_ref);

COMMENT ON COLUMN organizations.public_ref IS
  'URL slug for customer/rider public surfaces (e.g. {public_ref}.customer.dilivygo.app). Scoped per organization.';

-- ─── 2. Customers: backfill organization_id from order history ────────────────

-- Migration 073 collapsed every customer into the marketplace bucket. Reassign
-- each one to the organization of their most recent order so phone uniqueness
-- becomes per-org going forward.

UPDATE customers c
SET organization_id = t.organization_id
FROM (
  SELECT DISTINCT ON (o.customer_id) o.customer_id, o.organization_id
  FROM orders o
  WHERE o.customer_id IS NOT NULL AND o.organization_id IS NOT NULL
  ORDER BY o.customer_id, o.created_at DESC NULLS LAST
) t
WHERE c.id = t.customer_id
  AND c.organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- ─── 3. Dedup customers per (organization_id, phone) ──────────────────────────

CREATE TEMP TABLE IF NOT EXISTS _customer_keepers_org AS
SELECT DISTINCT ON (organization_id, phone)
  id AS keeper_id,
  organization_id,
  phone
FROM customers
WHERE phone IS NOT NULL AND length(trim(phone)) > 0
ORDER BY organization_id, phone, created_at ASC NULLS LAST, id ASC;

UPDATE orders o
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers_org k
  ON c.organization_id = k.organization_id AND c.phone = k.phone AND c.id <> k.keeper_id
WHERE o.customer_id = c.id;

UPDATE cart_sessions s
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers_org k
  ON c.organization_id = k.organization_id AND c.phone = k.phone AND c.id <> k.keeper_id
WHERE s.customer_id = c.id;

UPDATE customer_addresses a
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers_org k
  ON c.organization_id = k.organization_id AND c.phone = k.phone AND c.id <> k.keeper_id
WHERE a.customer_id = c.id;

UPDATE customer_favorites f
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers_org k
  ON c.organization_id = k.organization_id AND c.phone = k.phone AND c.id <> k.keeper_id
WHERE f.customer_id = c.id;

UPDATE shop_reviews r
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers_org k
  ON c.organization_id = k.organization_id AND c.phone = k.phone AND c.id <> k.keeper_id
WHERE r.customer_id = c.id;

UPDATE promo_redemptions pr
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers_org k
  ON c.organization_id = k.organization_id AND c.phone = k.phone AND c.id <> k.keeper_id
WHERE pr.customer_id = c.id;

UPDATE support_ticket_ratings str
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers_org k
  ON c.organization_id = k.organization_id AND c.phone = k.phone AND c.id <> k.keeper_id
WHERE str.customer_id = c.id;

UPDATE customer_wallet_ledger cwl
SET customer_id = k.keeper_id
FROM customers c
JOIN _customer_keepers_org k
  ON c.organization_id = k.organization_id AND c.phone = k.phone AND c.id <> k.keeper_id
WHERE cwl.customer_id = c.id;

DELETE FROM customers c
USING _customer_keepers_org k
WHERE c.organization_id = k.organization_id
  AND c.phone = k.phone
  AND c.id <> k.keeper_id;

DROP TABLE IF EXISTS _customer_keepers_org;

-- Replace deployment-wide phone uniqueness with per-org uniqueness
DROP INDEX IF EXISTS customers_phone_uq;

CREATE UNIQUE INDEX IF NOT EXISTS customers_organization_phone_uq
  ON customers (organization_id, phone)
  WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_organization_email_uq
  ON customers (organization_id, lower(email))
  WHERE email IS NOT NULL AND length(trim(email)) > 0;

-- ─── 4. organization_hostnames (per-org customer/rider custom domains) ────────

CREATE TABLE IF NOT EXISTS organization_hostnames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hostname TEXT NOT NULL,
  app_surface TEXT NOT NULL DEFAULT 'customer',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_hostnames_surface_check CHECK (
    app_surface IN ('customer', 'rider', 'apex')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_hostnames_hostname_lower_uq
  ON organization_hostnames (lower(hostname));

CREATE INDEX IF NOT EXISTS organization_hostnames_organization_id_idx
  ON organization_hostnames (organization_id);

COMMENT ON TABLE organization_hostnames IS
  'Per-organization custom domains for customer/rider public surfaces. '
  'Workspaces no longer expose public URLs; their DNS lives in workspace_hostnames '
  'for vendor/pos/superadmin staff tools only.';
