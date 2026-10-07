-- Migration: 063_refund_requests
-- Customer-initiated refund requests (superadmin approval before Stripe refund)

CREATE TABLE IF NOT EXISTS refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_ref text NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reason text NOT NULL,
  requested_amount_cents integer,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  internal_note text,
  rejection_reason text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES superadmins(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_project_ref ON refund_requests(project_ref);
CREATE INDEX IF NOT EXISTS idx_refund_requests_order_id ON refund_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_customer_id ON refund_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_created_at ON refund_requests(created_at DESC);

-- At most one pending request per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_requests_one_pending_per_order
  ON refund_requests(order_id)
  WHERE status = 'pending';
