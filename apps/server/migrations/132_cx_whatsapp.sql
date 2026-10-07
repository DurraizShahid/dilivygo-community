-- Migration: 132_cx_whatsapp
-- WhatsApp CX channel (Phase 22). Provider-neutral messaging for
-- surveys, case communication, and recovery notices with consent,
-- template discipline, and provider-evidenced delivery states.
-- Monetary offer text may only reference already-executed recovery
-- actions (enforced in code). No message is marked delivered without a
-- provider callback. Additive and idempotent. No seeds.

CREATE TABLE IF NOT EXISTS cx_wa_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  display_name TEXT,
  sender TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'error')),
  webhook_secret TEXT,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_wa_connections_org_idx
  ON cx_wa_connections (organization_id);

-- Approved message templates per org. Variables are allowlisted per
-- kind in code; unknown variables reject at send time.
CREATE TABLE IF NOT EXISTS cx_wa_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'survey_request', 'apology', 'recovery_offer',
    'order_followup', 'review_request'
  )),
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

CREATE TABLE IF NOT EXISTS cx_wa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES cx_wa_connections(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  case_id UUID REFERENCES cx_cases(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('out', 'in')),
  template_key TEXT,
  body TEXT,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  idempotency_key TEXT,
  recovery_action_id UUID REFERENCES cx_recovery_actions(id) ON DELETE SET NULL,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS cx_wa_messages_org_customer_idx
  ON cx_wa_messages (organization_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cx_wa_messages_provider_idx
  ON cx_wa_messages (organization_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cx_wa_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  opted_out BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, customer_id)
);

-- ─── Harden RLS: service_role only (matches 113–131 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_wa_connections') THEN
    REVOKE ALL ON TABLE cx_wa_connections FROM anon, authenticated;
    GRANT ALL ON TABLE cx_wa_connections TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_wa_templates') THEN
    REVOKE ALL ON TABLE cx_wa_templates FROM anon, authenticated;
    GRANT ALL ON TABLE cx_wa_templates TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_wa_messages') THEN
    REVOKE ALL ON TABLE cx_wa_messages FROM anon, authenticated;
    GRANT ALL ON TABLE cx_wa_messages TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_wa_consents') THEN
    REVOKE ALL ON TABLE cx_wa_consents FROM anon, authenticated;
    GRANT ALL ON TABLE cx_wa_consents TO service_role;
  END IF;
END $$;
