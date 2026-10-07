-- 116_domain_forwarding_cross_scope_lock.sql
-- Audit finding (HIGH): the cross-scope hostname uniqueness check in migration
-- 114 used a bare `SELECT EXISTS` predicate. Two concurrent inserts of the
-- same canonical hostname into the two different hostname tables could both
-- observe no conflict on the other table and both commit, because a plain
-- `SELECT` does not lock anything the peer insert holds.
--
-- Fix: serialize the check with a Postgres advisory transaction lock keyed on
-- the canonical hostname. Both hostname-table triggers take the same
-- `advisory_xact_lock(hashtextextended(canon, 0))` before evaluating the
-- hold-aware duplicate predicate, so the peer's row is guaranteed visible to
-- whichever trigger runs second. The (astronomically unlikely) hash collision
-- between distinct hostnames only adds harmless serialization.
--
-- The lock key uses the same canonicalization as 114 (`lower(rtrim(hostname,'.'))`),
-- so IDN aliases that differ only after app-side punycode canonicalization are
-- still invisible here (documented MEDIUM finding — no Postgres idna extension
-- available).
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + re-CREATE.

CREATE OR REPLACE FUNCTION check_hostname_cross_table_unique()
RETURNS TRIGGER AS $$
DECLARE
  other_exists BOOLEAN;
  canon TEXT;
BEGIN
  canon := lower(rtrim(NEW.hostname, '.'));

  -- Serialize dup-check across BOTH hostname tables on the canonical hostname.
  -- A bare SELECT is not enough: two concurrent cross-table inserts could both
  -- see "no conflict". Lock is released with the transaction (advisory_xact_lock).
  PERFORM pg_advisory_xact_lock(hashtextextended(canon, 0));

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