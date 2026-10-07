-- Migration: 007_audit_log
-- Audit trail for compliance and debugging

CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   UUID,
  details       JSONB,
  ip            INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id   ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action    ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource  ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created   ON audit_log(created_at DESC);

-- Add TOTP columns to app_users
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS totp_secret  TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
