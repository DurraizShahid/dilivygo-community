-- Migration: 058_app_users_first_last_name
-- Optional legal-style name parts for staff (admin / vendor / rider).

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS first_name TEXT;

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS last_name TEXT;

COMMENT ON COLUMN app_users.first_name IS 'Optional given name for the staff user.';
COMMENT ON COLUMN app_users.last_name IS 'Optional family name for the staff user.';
