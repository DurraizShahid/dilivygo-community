-- Migration: 082_app_users_per_org_email
-- Staff email uniqueness was previously platform-wide which made it impossible
-- for two separate organizations (tenants) to register a staff member with the
-- same email address. In a white-label multi-tenant deployment those two staff
-- accounts are completely independent identities, so uniqueness must be scoped
-- per organization — mirroring how `customers_organization_email_uq` /
-- `customers_organization_phone_uq` were introduced in migration 077.
--
-- Safety notes:
--   * `app_users.organization_id` has been NOT NULL since migration 073, so the
--     composite key is well-defined for every existing row.
--   * The legacy global index prevented collisions, so dropping it cannot
--     orphan existing data. If operators bypassed the index in the past via
--     direct SQL, the pre-flight duplicate-detection block below raises before
--     we try to create the new constraint.

DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*)
  INTO dup_count
  FROM (
    SELECT organization_id, lower(email) AS lemail
    FROM app_users
    GROUP BY organization_id, lower(email)
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION
      'app_users has % (organization_id, lower(email)) duplicate groups; '
      'resolve manually before applying migration 082', dup_count;
  END IF;
END $$;

-- Replace the deployment-wide unique index with a per-organization composite.
-- We `DROP IF EXISTS` first so this migration is idempotent and safe against
-- databases that were bootstrapped without migration 000's index.
DROP INDEX IF EXISTS app_users_email_uq;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_organization_email_uq
  ON app_users (organization_id, lower(email));

-- Non-unique index for lookups that don't know the org yet (platform console,
-- legacy tooling). Keeps `WHERE lower(email) = $1` queries index-backed even
-- without the unique constraint.
CREATE INDEX IF NOT EXISTS app_users_email_lower_idx
  ON app_users (lower(email));

COMMENT ON INDEX app_users_organization_email_uq IS
  'Staff email uniqueness is scoped per organization so independent tenants '
  'can host staff with overlapping email addresses. Paired with application-'
  'level checks in createStaff / createUser / signup.';
