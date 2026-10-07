-- Migration: 084_organization_member_customer_saved_views
-- SaaS dashboard customer directory reuses superadmin controllers behind
-- `/api/saas/sa/*`, but `superadmin_customer_saved_views.superadmin_id` FKs to
-- `superadmins`. Org members use `organization_members.id` from the SaaS shim,
-- so saved views for SaaS need a parallel table keyed by org membership.

CREATE TABLE IF NOT EXISTS organization_member_customer_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_member_id uuid NOT NULL REFERENCES organization_members (id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_member_cust_saved_views_member_idx
  ON organization_member_customer_saved_views (organization_member_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS org_member_cust_saved_views_name_uq
  ON organization_member_customer_saved_views (organization_member_id, lower(name));

COMMENT ON TABLE organization_member_customer_saved_views IS
  'Per–org-dashboard member saved filter sets for the customer directory (SaaS).';
