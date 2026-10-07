-- Community Edition: roles required by standalone PostgREST.
-- Plain postgres:16 lacks Supabase's built-in roles; create the minimum set.
-- Runs automatically via /docker-entrypoint-initdb.d on first volume init.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
