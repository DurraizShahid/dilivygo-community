-- =============================================================================
-- Migration: 117_postgrest_role_grants
-- Grants Supabase-default table/sequence privileges to the PostgREST roles
-- (anon, authenticated, service_role) for every table created by raw SQL
-- migrations. In Supabase-hosted projects these grants are applied
-- automatically by the platform; on a local Supabase stack they must be
-- explicit or every API call returns 42501 permission denied.
--
-- Roles are checked for existence so this migration is a safe no-op on
-- vanilla Postgres or any database that lacks the Supabase roles.
-- All statements are idempotent.
-- =============================================================================

DO $$
DECLARE
  v_role TEXT;
  v_has_pgcrypto BOOLEAN;
  v_fn TEXT;
BEGIN
  -- Grant schema usage to the Supabase roles when they exist.
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_role);
      EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %I', v_role);
      EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %I', v_role);
      EXECUTE format('GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO %I', v_role);
    END IF;
  END LOOP;

  -- Re-run for tables created after this migration runs (future-proofing).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO anon, authenticated, service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO anon, authenticated, service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON FUNCTIONS TO anon, authenticated, service_role';
  END IF;
END $$;