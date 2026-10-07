-- Migration: 018_superadmins
-- Platform-level superadmin table, separate from app_users.
-- Superadmins have no project_ref — they manage the entire platform.

CREATE TABLE IF NOT EXISTS superadmins (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  password_hash text NOT NULL,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS superadmins_email_uq ON superadmins(lower(email));

-- Seed default superadmin: super@dilivygo.com / Super123!
INSERT INTO superadmins (id, email, password_hash, name, created_at, updated_at)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'super@dilivygo.com',
  '$2b$12$6HxPRbD2bJDT2todR7GVHe64r7zqoh4TzisrL4xklKuOGcHJtDASm',
  'Platform Admin',
  now(),
  now()
)
ON CONFLICT (lower(email)) DO NOTHING;
