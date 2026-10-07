-- Migration: 057_app_users_display_name
-- Optional display name for staff accounts (admin / vendor / rider).

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS display_name TEXT;

COMMENT ON COLUMN app_users.display_name IS 'Optional human-readable name for the staff user.';
