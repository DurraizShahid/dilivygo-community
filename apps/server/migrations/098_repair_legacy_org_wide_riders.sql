-- Migration: 098_repair_legacy_org_wide_riders
-- Migration 073 used a synthetic marketplace organization as a safe fallback
-- before organization-wide rider semantics existed. New rider creation now
-- writes the real organization explicitly. Repair only legacy null-workspace
-- riders whose completed/assigned delivery history proves exactly one real org.
-- Ambiguous cross-org legacy riders intentionally remain in the marketplace org
-- and will fail closed at runtime until an operator assigns the correct org.

WITH inferred AS (
  SELECT
    d.rider_id::text AS rider_id,
    MIN(o.organization_id::text)::uuid AS organization_id,
    COUNT(DISTINCT o.organization_id) AS organization_count
  FROM deliveries d
  JOIN orders o ON o.id = d.order_id
  WHERE d.rider_id IS NOT NULL
    AND o.organization_id IS NOT NULL
    AND o.organization_id <> '00000000-0000-0000-0000-000000000001'::uuid
  GROUP BY d.rider_id::text
), unambiguous AS (
  SELECT rider_id, organization_id
  FROM inferred
  WHERE organization_count = 1
)
UPDATE app_users u
SET organization_id = x.organization_id
FROM unambiguous x
WHERE u.id::text = x.rider_id
  AND u.role = 'rider'
  AND (u.project_ref IS NULL OR btrim(u.project_ref) = '')
  AND u.organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- Rider geofence rows are rider-owned metadata. Once the user's organization is
-- repaired, bring any legacy marketplace-scoped geofence into the same tenant.
UPDATE rider_geofences rg
SET organization_id = u.organization_id
FROM app_users u
WHERE rg.user_id::text = u.id::text
  AND u.role = 'rider'
  AND (u.project_ref IS NULL OR btrim(u.project_ref) = '')
  AND u.organization_id <> '00000000-0000-0000-0000-000000000001'::uuid
  AND rg.organization_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- Existing payout rows predate org-wide payouts and therefore always have a
-- workspace project_ref. Reassert their organization from that workspace in
-- case earlier fallback triggers mislabeled a historical row.
UPDATE rider_payouts rp
SET organization_id = w.organization_id
FROM workspaces w
WHERE rp.project_ref IS NOT NULL
  AND w.project_ref = rp.project_ref
  AND rp.organization_id IS DISTINCT FROM w.organization_id;
