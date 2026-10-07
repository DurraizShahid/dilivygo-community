-- Migration: 005_conversations_messages
-- Chat system: conversations and messages tables

CREATE TABLE IF NOT EXISTS conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_ref      TEXT NOT NULL,
  order_id         UUID REFERENCES orders(id) ON DELETE SET NULL,
  type             TEXT NOT NULL CHECK (type IN ('customer_vendor', 'vendor_rider')),
  participant_1_id UUID NOT NULL,
  participant_2_id UUID NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_project_ref ON conversations(project_ref);
CREATE INDEX IF NOT EXISTS idx_conversations_order_id    ON conversations(order_id);
CREATE INDEX IF NOT EXISTS idx_conversations_p1          ON conversations(participant_1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_p2          ON conversations(participant_2_id);

CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        UUID NOT NULL,
  sender_role      TEXT CHECK (sender_role IN ('customer', 'vendor', 'rider', 'admin')),
  content          TEXT NOT NULL CHECK (char_length(content) <= 2000),
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id       ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at      ON messages(created_at DESC);
