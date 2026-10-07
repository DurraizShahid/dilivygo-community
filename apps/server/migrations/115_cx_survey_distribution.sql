-- Migration: 115_cx_survey_distribution
-- Make surveys distributable via QR, links, shop/table, order and campaign contexts with attributable expiring tokens.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Distributions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_survey_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  survey_id UUID NOT NULL REFERENCES cx_survey_definitions(id) ON DELETE CASCADE,
  survey_version_id UUID NOT NULL REFERENCES cx_survey_versions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('link', 'qr', 'shop_qr', 'table_qr', 'pos_receipt', 'order_link', 'campaign', 'whatsapp', 'email', 'sms', 'api')),
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  label TEXT, -- e.g. Table 12, POS-2, Campaign X
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired', 'revoked')),
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  uses_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_survey_distributions_org_survey_idx
  ON cx_survey_distributions (organization_id, survey_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cx_survey_distributions_org_channel_idx
  ON cx_survey_distributions (organization_id, channel);

CREATE INDEX IF NOT EXISTS cx_survey_distributions_shop_idx
  ON cx_survey_distributions (shop_id) WHERE shop_id IS NOT NULL;

-- ─── Access Tokens (opaque high-entropy, hashed at rest) ──────────────────
CREATE TABLE IF NOT EXISTS cx_survey_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  distribution_id UUID NOT NULL REFERENCES cx_survey_distributions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  max_uses INTEGER, -- NULL = unlimited, 1 = one-time
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cx_survey_access_tokens_distribution_idx
  ON cx_survey_access_tokens (distribution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cx_survey_access_tokens_customer_idx
  ON cx_survey_access_tokens (customer_id) WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cx_survey_access_tokens_expires_idx
  ON cx_survey_access_tokens (expires_at) WHERE expires_at IS NOT NULL;

-- ─── Responses (immutable once submitted, link to frozen version) ──────────
CREATE TABLE IF NOT EXISTS cx_survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  survey_id UUID NOT NULL REFERENCES cx_survey_definitions(id) ON DELETE CASCADE,
  survey_version_id UUID NOT NULL REFERENCES cx_survey_versions(id) ON DELETE CASCADE,
  distribution_id UUID REFERENCES cx_survey_distributions(id) ON DELETE SET NULL,
  access_token_id UUID REFERENCES cx_survey_access_tokens(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb, -- {questionKey: value}
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, -- {ip, userAgent}
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_survey_responses_org_survey_idx
  ON cx_survey_responses (organization_id, survey_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS cx_survey_responses_version_idx
  ON cx_survey_responses (survey_version_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS cx_survey_responses_distribution_idx
  ON cx_survey_responses (distribution_id) WHERE distribution_id IS NOT NULL;

-- Grants
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_survey_distributions') THEN
    REVOKE ALL ON TABLE cx_survey_distributions FROM anon, authenticated;
    GRANT ALL ON TABLE cx_survey_distributions TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_survey_access_tokens') THEN
    REVOKE ALL ON TABLE cx_survey_access_tokens FROM anon, authenticated;
    GRANT ALL ON TABLE cx_survey_access_tokens TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_survey_responses') THEN
    REVOKE ALL ON TABLE cx_survey_responses FROM anon, authenticated;
    GRANT ALL ON TABLE cx_survey_responses TO service_role;
  END IF;
END $$;

COMMENT ON TABLE cx_survey_distributions IS 'Attributable survey distribution per channel/shop/label with expiry and usage caps.';
COMMENT ON TABLE cx_survey_access_tokens IS 'Opaque high-entropy tokens hashed at rest (SHA256). Public URLs expose raw token only once; replay protection via uses/max_uses and revoked_at.';
COMMENT ON TABLE cx_survey_responses IS 'Immutable survey response linked to frozen survey_version_id. Anonymous allowed (customer_id NULL) but distribution/shop attribution preserved.';
