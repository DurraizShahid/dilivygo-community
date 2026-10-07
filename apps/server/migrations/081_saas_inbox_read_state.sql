-- Migration: 081_saas_inbox_read_state
--
-- Per-org-member "read" / dismiss markers for the SaaS notification tray
-- (mirror of `superadmin_inbox_read_state`, keyed by `organization_members.id`
-- instead of `superadmins.id`).
--
-- Why a separate table: `superadmin_inbox_read_state.superadmin_id` has an FK
-- to `superadmins(id)`. SaaS dashboard callers come in via Clerk → their
-- stable identity is `organization_members.id`, which does not exist in
-- `superadmins`. A dedicated table lets us give each SaaS user the same
-- dismiss semantics as platform superadmins without relaxing the superadmin
-- FK or polluting its namespace.
--
-- Key shape matches the existing `superadmin_inbox_read_state`:
--   * `item_key`   – opaque string like `rr:<uuid>` (refund request) or
--                    `ord:<uuid>` (order). Matches the ids emitted by
--                    `superadmin-inbox.controller` so both tables can be
--                    queried with identical item-key lookups.
--   * `snapshot`   – stores the `updated_at` the reader last saw, so an item
--                    re-surfaces as unread if it updates after being read.
--                    NULL for categories where "read once" is final (refunds).
--   * `read_at`    – wall-clock timestamp the row was written.
--
-- Message-level read state (`messages.read_at`) already works for SaaS
-- callers because it keys on the message itself, not the reader. This table
-- only covers refund / order inbox items, matching the superadmin table.

CREATE TABLE IF NOT EXISTS saas_inbox_read_state (
  organization_member_id UUID NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  snapshot TEXT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_member_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_saas_inbox_read_state_member
  ON saas_inbox_read_state (organization_member_id);

COMMENT ON TABLE saas_inbox_read_state IS
  'Per-org-member read/dismiss markers for SaaS dashboard notification tray items (refund_requests, orders). Mirrors superadmin_inbox_read_state.';
