-- Migration: 070_organizations
-- SaaS: organization layer above workspaces; one Stripe subscription per org; many workspaces per org.

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stripe_billing_customer_id TEXT,
  stripe_subscription_id TEXT,
  billing_subscription_status TEXT,
  billing_current_period_end TIMESTAMPTZ,
  billing_trial_end TIMESTAMPTZ,
  billing_price_id TEXT
);

COMMENT ON TABLE organizations IS 'SaaS customer organization; owns N workspaces; Stripe Billing lives here.';

CREATE UNIQUE INDEX IF NOT EXISTS organizations_stripe_subscription_id_uq
  ON organizations (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL AND stripe_subscription_id <> '';

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_members_org_clerk_uq UNIQUE (organization_id, clerk_user_id)
);

CREATE INDEX IF NOT EXISTS organization_members_clerk_user_id_idx ON organization_members (clerk_user_id);

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS saas_staff_bootstrap_completed BOOLEAN NOT NULL DEFAULT false;

-- Backfill from workspace_clerk_owners: one org per row, billing copied from workspace.
DO $$
DECLARE
  rec RECORD;
  v_org_id UUID;
BEGIN
  FOR rec IN
    SELECT wco.clerk_user_id,
           wco.workspace_id,
           wco.bootstrap_completed,
           w.id AS ws_id,
           w.name AS ws_name,
           w.created_at AS ws_created,
           w.updated_at AS ws_updated,
           w.stripe_billing_customer_id,
           w.stripe_subscription_id,
           w.billing_subscription_status,
           w.billing_current_period_end,
           w.billing_trial_end,
           w.billing_price_id
    FROM workspace_clerk_owners wco
    INNER JOIN workspaces w ON w.id = wco.workspace_id
  LOOP
    INSERT INTO organizations (
      id,
      name,
      created_at,
      updated_at,
      stripe_billing_customer_id,
      stripe_subscription_id,
      billing_subscription_status,
      billing_current_period_end,
      billing_trial_end,
      billing_price_id
    )
    VALUES (
      gen_random_uuid(),
      rec.ws_name,
      rec.ws_created,
      rec.ws_updated,
      rec.stripe_billing_customer_id,
      rec.stripe_subscription_id,
      rec.billing_subscription_status,
      rec.billing_current_period_end,
      rec.billing_trial_end,
      rec.billing_price_id
    )
    RETURNING id INTO v_org_id;

    UPDATE workspaces
    SET organization_id = v_org_id,
        saas_staff_bootstrap_completed = COALESCE(rec.bootstrap_completed, false)
    WHERE id = rec.workspace_id;

    INSERT INTO organization_members (id, organization_id, clerk_user_id, role)
    VALUES (gen_random_uuid(), v_org_id, rec.clerk_user_id, 'owner');
  END LOOP;
END $$;

-- Orphan workspaces that had Stripe billing but no workspace_clerk_owners row: one org per workspace.
DO $$
DECLARE
  rec RECORD;
  v_org_id UUID;
BEGIN
  FOR rec IN
    SELECT w.*
    FROM workspaces w
    WHERE w.organization_id IS NULL
      AND (
        w.stripe_billing_customer_id IS NOT NULL
        OR w.stripe_subscription_id IS NOT NULL
      )
  LOOP
    INSERT INTO organizations (
      id,
      name,
      created_at,
      updated_at,
      stripe_billing_customer_id,
      stripe_subscription_id,
      billing_subscription_status,
      billing_current_period_end,
      billing_trial_end,
      billing_price_id
    )
    VALUES (
      gen_random_uuid(),
      rec.name,
      rec.created_at,
      rec.updated_at,
      rec.stripe_billing_customer_id,
      rec.stripe_subscription_id,
      rec.billing_subscription_status,
      rec.billing_current_period_end,
      rec.billing_trial_end,
      rec.billing_price_id
    )
    RETURNING id INTO v_org_id;

    UPDATE workspaces SET organization_id = v_org_id WHERE id = rec.id;
  END LOOP;
END $$;

DROP TABLE IF EXISTS workspace_clerk_owners;

ALTER TABLE workspaces DROP COLUMN IF EXISTS stripe_billing_customer_id;
ALTER TABLE workspaces DROP COLUMN IF EXISTS stripe_subscription_id;
ALTER TABLE workspaces DROP COLUMN IF EXISTS billing_subscription_status;
ALTER TABLE workspaces DROP COLUMN IF EXISTS billing_current_period_end;
ALTER TABLE workspaces DROP COLUMN IF EXISTS billing_trial_end;
ALTER TABLE workspaces DROP COLUMN IF EXISTS billing_price_id;

DROP INDEX IF EXISTS workspaces_stripe_subscription_id_uq;
