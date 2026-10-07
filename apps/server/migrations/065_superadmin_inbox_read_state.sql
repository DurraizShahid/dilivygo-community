-- Superadmin notification tray: per-admin dismiss / "read" markers for inbox items
-- (refund rows, order activity snapshots). Support message read state remains on `messages.read_at`.

CREATE TABLE IF NOT EXISTS superadmin_inbox_read_state (
  superadmin_id uuid NOT NULL REFERENCES superadmins(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  snapshot text NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (superadmin_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_superadmin_inbox_read_state_superadmin
  ON superadmin_inbox_read_state (superadmin_id);

-- Unread customer (and non-superadmin) messages per support conversation for a given reader id.
CREATE OR REPLACE FUNCTION superadmin_support_unread_counts(p_reader_id uuid)
RETURNS TABLE (conversation_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT m.conversation_id, COUNT(*)::bigint
  FROM messages m
  INNER JOIN conversations c ON c.id = m.conversation_id AND c.type = 'customer_support'
  WHERE m.read_at IS NULL
    AND m.sender_id IS DISTINCT FROM p_reader_id
  GROUP BY m.conversation_id;
$$;
