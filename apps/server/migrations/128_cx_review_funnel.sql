-- Migration: 128_cx_review_funnel
-- Public review funnel (Phase 18). Policy-compliant review requests:
-- destinations are shown to EVERY guest (never gated on sentiment),
-- while negative feedback flows to private recovery independently.
-- Sends are idempotent per key, frequency-capped per customer, and
-- honor per-customer opt-out. Click tracking records only our own
-- redirect hits — never fabricated external conversions. Additive and
-- idempotent. No seeds.

-- Staff-configured outbound destinations per shop (provider review URLs),
-- with an org-level fallback row (shop_id NULL).
CREATE TABLE IF NOT EXISTS cx_review_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, shop_id, provider)
);

CREATE INDEX IF NOT EXISTS cx_review_destinations_org_shop_idx
  ON cx_review_destinations (organization_id, shop_id) WHERE is_active;

-- One row per review-request episode. Idempotent by (org, idempotency_key);
-- frequency caps and opt-out are enforced in code before insert.
CREATE TABLE IF NOT EXISTS cx_review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  feedback_submission_id UUID REFERENCES cx_feedback_submissions(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'link', 'staff')),
  provider TEXT,
  destination_url TEXT,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'clicked', 'suppressed', 'opted_out', 'failed')),
  idempotency_key TEXT NOT NULL,
  public_token TEXT UNIQUE,
  sent_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  provider_receipt TEXT,
  error TEXT,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS cx_review_requests_org_customer_idx
  ON cx_review_requests (organization_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cx_review_requests_org_order_idx
  ON cx_review_requests (organization_id, order_id);

-- Per-customer review-request consent. Opt-out flips opted_out; sends
-- check this table first. One row per (org, customer).
CREATE TABLE IF NOT EXISTS cx_review_request_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  opted_out BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, customer_id)
);

-- ─── Harden RLS: service_role only (matches 113–127 style) ─────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_review_destinations') THEN
    REVOKE ALL ON TABLE cx_review_destinations FROM anon, authenticated;
    GRANT ALL ON TABLE cx_review_destinations TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_review_requests') THEN
    REVOKE ALL ON TABLE cx_review_requests FROM anon, authenticated;
    GRANT ALL ON TABLE cx_review_requests TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_review_request_consents') THEN
    REVOKE ALL ON TABLE cx_review_request_consents FROM anon, authenticated;
    GRANT ALL ON TABLE cx_review_request_consents TO service_role;
  END IF;
END $$;
