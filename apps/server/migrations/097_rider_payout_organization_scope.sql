-- Migration: 097_rider_payout_organization_scope
-- Organization-wide riders intentionally have no workspace project_ref. Payouts
-- therefore belong to the rider's organization first; project_ref is optional
-- metadata for workspace-bound riders, never a substitute tenant boundary.

ALTER TABLE rider_payouts
  ALTER COLUMN project_ref DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rider_payouts_organization
  ON rider_payouts(organization_id);

-- Remove the pre-organization RPC so no caller can accidentally create a payout
-- whose organization is inferred from a NULL project_ref and falls into the
-- legacy marketplace organization.
DROP FUNCTION IF EXISTS rider_request_payout(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION rider_request_payout(
  p_id UUID,
  p_rider_id TEXT,
  p_project_ref TEXT,
  p_organization_id UUID,
  p_amount_cents INTEGER,
  p_payout_method TEXT DEFAULT 'manual',
  p_note TEXT DEFAULT NULL
)
RETURNS SETOF rider_payouts
LANGUAGE plpgsql
AS $$
DECLARE
  v_rider_project_ref TEXT;
  v_rider_organization_id UUID;
  v_rider_role TEXT;
  v_workspace_organization_id UUID;
  v_total_net BIGINT;
  v_reserved BIGINT;
  v_available BIGINT;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid payout amount';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'rider payout organization is required';
  END IF;

  SELECT role, project_ref, organization_id
    INTO v_rider_role, v_rider_project_ref, v_rider_organization_id
    FROM app_users
   WHERE id::text = p_rider_id
   FOR SHARE;

  IF NOT FOUND OR v_rider_role <> 'rider' THEN
    RAISE EXCEPTION 'rider not found';
  END IF;
  IF v_rider_organization_id IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'rider organization mismatch';
  END IF;

  IF p_project_ref IS NOT NULL AND btrim(p_project_ref) <> '' THEN
    SELECT organization_id
      INTO v_workspace_organization_id
      FROM workspaces
     WHERE project_ref = p_project_ref;

    IF NOT FOUND OR v_workspace_organization_id IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'payout workspace organization mismatch';
    END IF;

    -- Workspace-bound riders may request only against their own workspace.
    -- Organization-wide riders (NULL project_ref) may legitimately aggregate
    -- earnings across every workspace inside their organization.
    IF v_rider_project_ref IS NOT NULL
       AND btrim(v_rider_project_ref) <> ''
       AND v_rider_project_ref <> p_project_ref THEN
      RAISE EXCEPTION 'rider workspace mismatch';
    END IF;
  ELSIF v_rider_project_ref IS NOT NULL AND btrim(v_rider_project_ref) <> '' THEN
    -- A workspace rider cannot drop its workspace scope when requesting money.
    RAISE EXCEPTION 'workspace rider payout requires project ref';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_rider_id, 0));

  SELECT COALESCE(SUM(net_cents), 0)
    INTO v_total_net
    FROM rider_earnings
   WHERE rider_id = p_rider_id
     AND organization_id = p_organization_id
     AND (
       p_project_ref IS NULL OR btrim(p_project_ref) = '' OR project_ref = p_project_ref
     );

  SELECT COALESCE(SUM(amount_cents), 0)
    INTO v_reserved
    FROM rider_payouts
   WHERE rider_id = p_rider_id
     AND organization_id = p_organization_id
     AND status IN ('pending', 'approved', 'processing', 'completed')
     AND (
       p_project_ref IS NULL OR btrim(p_project_ref) = '' OR project_ref = p_project_ref
     );

  v_available := GREATEST(0, v_total_net - v_reserved);
  IF p_amount_cents > v_available THEN
    RAISE EXCEPTION 'insufficient rider payout balance';
  END IF;

  RETURN QUERY
    INSERT INTO rider_payouts (
      id,
      rider_id,
      project_ref,
      organization_id,
      amount_cents,
      status,
      payout_method,
      note,
      created_at,
      updated_at
    ) VALUES (
      p_id,
      p_rider_id,
      NULLIF(btrim(p_project_ref), ''),
      p_organization_id,
      p_amount_cents,
      'pending',
      COALESCE(p_payout_method, 'manual'),
      p_note,
      NOW(),
      NOW()
    )
    RETURNING *;
END;
$$;
