-- Support tickets: optional end state (both customer and superadmin can close/reopen)

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS support_closed_at TIMESTAMPTZ;

COMMENT ON COLUMN conversations.support_closed_at IS
  'When set, customer_support thread is closed — no new messages until cleared.';
