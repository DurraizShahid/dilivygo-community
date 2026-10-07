-- 114_domain_forwarding_cross_scope_hold.sql
-- F2 (domain security hardening): cross-table hostname uniqueness must respect
-- the takeover-hold window. Migration 113's trigger only blocked an insert when
-- the other-scope row had `status <> 'removed'`, so a non-expired tombstone
-- (removed + hold_until still in the future) did NOT block a rival tenant from
-- claiming the hostname. This replaces the function with a hold-aware predicate:
-- the other-scope row blocks UNLESS it is a removed row whose hold has FULLY
-- elapsed (in which case the row is an expired tombstone and reusable).
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + re-CREATE.

CREATE OR REPLACE FUNCTION check_hostname_cross_table_unique()
RETURNS TRIGGER AS $$
DECLARE
  other_exists BOOLEAN;
  canon TEXT;
BEGIN
  canon := lower(rtrim(NEW.hostname, '.'));
  -- Incoming row: allow an expired tombstone to be re-written (cleanup job should have deleted it).
  IF NEW.status = 'removed' AND NEW.hold_until IS NOT NULL AND NEW.hold_until < now() THEN
    RETURN NEW;
  END IF;

  -- Other-scope row BLOCKS the claim unless it is an expired tombstone.
  IF TG_TABLE_NAME = 'organization_hostnames' THEN
    SELECT EXISTS (
      SELECT 1 FROM workspace_hostnames w
      WHERE lower(rtrim(w.hostname, '.')) = canon
        AND NOT (
          w.status = 'removed'
          AND w.hold_until IS NOT NULL
          AND w.hold_until < now()
        )
    ) INTO other_exists;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM organization_hostnames o
      WHERE lower(rtrim(o.hostname, '.')) = canon
        AND NOT (
          o.status = 'removed'
          AND o.hold_until IS NOT NULL
          AND o.hold_until < now()
        )
    ) INTO other_exists;
  END IF;

  IF other_exists THEN
    RAISE EXCEPTION 'hostname already claimed in other scope: %', NEW.hostname
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organization_hostnames_cross_unique_trg ON organization_hostnames;
CREATE TRIGGER organization_hostnames_cross_unique_trg
  BEFORE INSERT OR UPDATE OF hostname, status ON organization_hostnames
  FOR EACH ROW EXECUTE FUNCTION check_hostname_cross_table_unique();

DROP TRIGGER IF EXISTS workspace_hostnames_cross_unique_trg ON workspace_hostnames;
CREATE TRIGGER workspace_hostnames_cross_unique_trg
  BEFORE INSERT OR UPDATE OF hostname, status ON workspace_hostnames
  FOR EACH ROW EXECUTE FUNCTION check_hostname_cross_table_unique();