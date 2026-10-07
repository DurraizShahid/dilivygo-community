-- Migration: 120_cx_recovery_actions
-- Recovery actions with idempotency, approval states, and integration
-- with existing wallet, refund, and promo systems.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Recovery Actions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_recovery_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cx_cases(id) ON DELETE CASCADE,
  feedback_submission_id UUID REFERENCES cx_feedback_submissions(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,

  -- Action definition
  type TEXT NOT NULL
    CHECK (type IN (
      'wallet_credit',      -- Add funds to customer wallet (store credit)
      'refund',             -- Refund to original payment method (full)
      'promo_voucher',      -- Create promo code for future order
      'free_delivery',      -- Free delivery on next order
      'partial_refund',     -- Refund specific amount
      'percent_discount',   -- Percentage-off promo for next order
      'fixed_discount',     -- Fixed-amount-off promo for next order
      'free_item',          -- Free item on next order
      'replacement_order',  -- Replacement-order intent (manual fulfillment)
      'apology_contact',    -- Customer contact with apology
      'goodwill_gesture'    -- Generic goodwill gesture (wallet credit)
    )),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed', 'expired')),
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  approved_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,

  -- Amount/currency (for monetary actions)
  amount_cents INTEGER CHECK (amount_cents IS NULL OR amount_cents >= 0),
  currency TEXT CHECK (currency IS NULL OR length(currency) = 3),

  -- For promo-based actions
  promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL,
  promo_expires_at TIMESTAMPTZ,

  -- For wallet actions
  wallet_ledger_id UUID REFERENCES customer_wallet_ledger(id) ON DELETE SET NULL,

  -- For refund actions
  refund_operation_id UUID REFERENCES order_refund_operations(id) ON DELETE SET NULL,

  -- Idempotency (replays return the existing row; never double-execute).
  -- Scoped per organization so one tenant cannot squat another's key.
  idempotency_key TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key),

  -- Context
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cx_recovery_actions_case_idx
  ON cx_recovery_actions (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cx_recovery_actions_org_status_idx
  ON cx_recovery_actions (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS cx_recovery_actions_feedback_idx
  ON cx_recovery_actions (feedback_submission_id)
  WHERE feedback_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cx_recovery_actions_order_idx
  ON cx_recovery_actions (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cx_recovery_actions_customer_idx
  ON cx_recovery_actions (customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

-- ─── Recovery Redemptions (attribution) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_recovery_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recovery_action_id UUID NOT NULL REFERENCES cx_recovery_actions(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revenue_attributed_cents INTEGER,
  UNIQUE (recovery_action_id) -- one redemption per action
);

CREATE INDEX IF NOT EXISTS cx_recovery_redemptions_order_idx
  ON cx_recovery_redemptions (order_id)
  WHERE order_id IS NOT NULL;

-- ─── Guardrails (org-level limits) ──────────────────────────────────────
-- NOTE (P29 audit): UNIQUE table constraints cannot contain expressions
-- (COALESCE) on any PostgreSQL version, so the per-scope uniqueness lives
-- in the index below instead of inline. This file never applied
-- successfully before the fix (the runner is transactional per file), so
-- editing in place is safe: partial manual application still converges
-- via IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS cx_recovery_guardrails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('organization', 'workspace', 'shop', 'customer')),
  scope_ref TEXT, -- workspace project_ref / shop_id / customer_id depending on scope
  kind TEXT NOT NULL, -- max_amount_cents, max_per_window, cooldown_hours, max_actions_per_case
  value JSONB NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS cx_recovery_guardrails_unique
  ON cx_recovery_guardrails (organization_id, scope, (COALESCE(scope_ref, '')), kind);

CREATE INDEX IF NOT EXISTS cx_recovery_guardrails_org_idx
  ON cx_recovery_guardrails (organization_id);

-- ─── Execution Log (audit trail for each execution attempt) ─────────────
CREATE TABLE IF NOT EXISTS cx_recovery_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recovery_action_id UUID NOT NULL REFERENCES cx_recovery_actions(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  external_ref TEXT, -- stripe charge id, promo code, etc.
  performed_by_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  performed_by_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS cx_recovery_execution_log_action_idx
  ON cx_recovery_execution_log (recovery_action_id, attempted_at DESC);

-- ─── Grants ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_recovery_actions') THEN
    REVOKE ALL ON TABLE cx_recovery_actions FROM anon, authenticated;
    GRANT ALL ON TABLE cx_recovery_actions TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_recovery_redemptions') THEN
    REVOKE ALL ON TABLE cx_recovery_redemptions FROM anon, authenticated;
    GRANT ALL ON TABLE cx_recovery_redemptions TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_recovery_guardrails') THEN
    REVOKE ALL ON TABLE cx_recovery_guardrails FROM anon, authenticated;
    GRANT ALL ON TABLE cx_recovery_guardrails TO service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_recovery_execution_log') THEN
    REVOKE ALL ON TABLE cx_recovery_execution_log FROM anon, authenticated;
    GRANT ALL ON TABLE cx_recovery_execution_log TO service_role;
  END IF;
END $$;

COMMENT ON TABLE cx_recovery_actions IS 'Recovery actions with idempotency, approval, and integration with wallet/refund/promo systems';
COMMENT ON TABLE cx_recovery_redemptions IS 'Tracks when a recovery action is redeemed by a customer (attribution)';
COMMENT ON TABLE cx_recovery_guardrails IS 'Org-level limits: max amount per action, max per window, cooldowns, max per case';
COMMENT ON TABLE cx_recovery_execution_log IS 'Audit trail for every execution attempt (success or failure)';