-- Migration: 042_promotional_notifications
-- Push campaign / promotional notification support for superadmins

CREATE TABLE IF NOT EXISTS promotional_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  target_audience TEXT NOT NULL CHECK (target_audience IN ('all', 'customers', 'riders', 'vendors')),
  data            JSONB DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  sent_count      INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  total_tokens    INTEGER NOT NULL DEFAULT 0,
  created_by      UUID,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_notif_status ON promotional_notifications(status);
CREATE INDEX IF NOT EXISTS idx_promo_notif_created ON promotional_notifications(created_at DESC);
