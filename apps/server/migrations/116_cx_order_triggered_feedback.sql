-- Migration: 116_cx_order_triggered_feedback
-- Configurable triggers for order/support/refund events with delays, eligibility and suppression; idempotent scheduled requests.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Trigger configs (event -> survey mapping) ────────────────────────────
CREATE TABLE IF NOT EXISTS cx_trigger_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('ORDER_COMPLETED', 'ORDER_CANCELLED', 'REFUND_COMPLETED', 'DELIVERY_DELAYED', 'CUSTOMER_INACTIVE', 'SUPPORT_CASE_CLOSED')),
  survey_id UUID NOT NULL REFERENCES cx_survey_definitions(id) ON DELETE CASCADE,
  delay_minutes INTEGER NOT NULL DEFAULT 60 CHECK (delay_minutes >= 0 AND delay_minutes <= 10080),
  channel TEXT NOT NULL DEFAULT 'link' CHECK (channel IN ('link', 'qr', 'shop_qr', 'table_qr', 'pos_receipt', 'order_link', 'campaign', 'whatsapp', 'email', 'sms', 'api')),
  eligibility JSONB NOT NULL DEFAULT '{}'::jsonb, -- {shopIds:[], fulfillmentTypes:[], customerType:'first'|'repeat'|'any', orderTypes:[]}
  suppression JSONB NOT NULL DEFAULT '{}'::jsonb, -- {cooldownHours:24, maxPerWeek:1}
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cx_trigger_configs_org_event_survey_unique UNIQUE (organization_id, event, survey_id)
);

CREATE INDEX IF NOT EXISTS cx_trigger_configs_org_event_idx
  ON cx_trigger_configs (organization_id, event, enabled) WHERE enabled = true;

-- ─── Scheduled requests (idempotent, one per logical trigger) ──────────────
CREATE TABLE IF NOT EXISTS cx_scheduled_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_config_id UUID NOT NULL REFERENCES cx_trigger_configs(id) ON DELETE CASCADE,
  survey_id UUID NOT NULL REFERENCES cx_survey_definitions(id) ON DELETE CASCADE,
  survey_version_id UUID REFERENCES cx_survey_versions(id) ON DELETE SET NULL,
  distribution_id UUID REFERENCES cx_survey_distributions(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'cancelled')),
  suppression_reason TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cx_scheduled_requests_idempotency_unique UNIQUE (idempotency_key)
);

-- Idempotency: one logical trigger per order (or customer+event) — enforced via idempotency_key generation in service
CREATE INDEX IF NOT EXISTS cx_scheduled_requests_pending_idx
  ON cx_scheduled_requests (organization_id, status, scheduled_for) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS cx_scheduled_requests_customer_cooldown_idx
  ON cx_scheduled_requests (organization_id, customer_id, scheduled_for DESC) WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cx_scheduled_requests_order_idx
  ON cx_scheduled_requests (order_id) WHERE order_id IS NOT NULL;

-- Grants
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_trigger_configs') THEN
    REVOKE ALL ON TABLE cx_trigger_configs FROM anon, authenticated;
    GRANT ALL ON TABLE cx_trigger_configs TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_scheduled_requests') THEN
    REVOKE ALL ON TABLE cx_scheduled_requests FROM anon, authenticated;
    GRANT ALL ON TABLE cx_scheduled_requests TO service_role;
  END IF;
END $$;

COMMENT ON TABLE cx_trigger_configs IS 'Event -> survey mapping per org with delay, channel and eligibility predicates. Resolved at execution time to latest published version.';
COMMENT ON TABLE cx_scheduled_requests IS 'Idempotent scheduled survey requests. One per (trigger_config, order) via idempotency_key. Records suppression, attempts and delivery outcome.';
