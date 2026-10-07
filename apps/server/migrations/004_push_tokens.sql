-- Migration: 004_push_tokens
-- FCM device token storage for push notifications

CREATE TABLE IF NOT EXISTS push_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  user_role    TEXT,
  token        TEXT NOT NULL,
  platform     TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  project_ref  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_project_ref ON push_tokens(project_ref);
