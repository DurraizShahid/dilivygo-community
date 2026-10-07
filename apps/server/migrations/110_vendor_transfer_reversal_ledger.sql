-- Durable Stripe Connect transfer-reversal ledger for settlement accounting.
-- A vendor_payment_transfers row is the outbound platform -> connected-account
-- transfer. Refunds can later reverse part of that transfer. The original row is
-- intentionally immutable once completed, so persist each actual Stripe
-- transfer reversal separately instead of inferring it from order state.

CREATE TABLE IF NOT EXISTS vendor_payment_transfer_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  vendor_payment_transfer_id UUID NOT NULL REFERENCES vendor_payment_transfers(id) ON DELETE RESTRICT,
  refund_operation_id UUID NOT NULL REFERENCES order_refund_operations(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  stripe_transfer_reversal_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vendor_payment_transfer_reversals_refund_uq UNIQUE (refund_operation_id),
  CONSTRAINT vendor_payment_transfer_reversals_stripe_uq UNIQUE (stripe_transfer_reversal_id)
);

CREATE INDEX IF NOT EXISTS vendor_payment_transfer_reversals_org_completed_idx
  ON vendor_payment_transfer_reversals (organization_id, completed_at ASC);

CREATE INDEX IF NOT EXISTS vendor_payment_transfer_reversals_transfer_idx
  ON vendor_payment_transfer_reversals (vendor_payment_transfer_id, completed_at ASC);

-- Financial event tables are server-owned. Browser/client roles must not be able
-- to create or mutate transfer-reversal history directly through PostgREST.
REVOKE ALL ON TABLE vendor_payment_transfer_reversals FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE vendor_payment_transfer_reversals TO service_role;
