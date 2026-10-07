-- Migration: 116_ai_memory
-- AI conversation state: ephemeral history, rolling summaries, structured slots.
-- Scoped by organization + actor. No FKs to app tables so synthetic tenant ids
-- work; rows are meaningless outside their (organization_id, actor_id) scope.
-- Raw provider prompts and tool blobs are never stored here by convention
-- (see lib/ai/memory); only user text, assistant answers, summaries, and slots.

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  project_ref TEXT,
  actor_id TEXT NOT NULL DEFAULT '',
  actor_kind TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  summary_up_to INTEGER NOT NULL DEFAULT 0,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_scope_idx
  ON ai_conversations (organization_id, project_ref, actor_id);

CREATE INDEX IF NOT EXISTS ai_conversations_expiry_idx
  ON ai_conversations (expires_at);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_messages_conv_seq_uq UNIQUE (conversation_id, seq)
);

CREATE INDEX IF NOT EXISTS ai_messages_conv_idx
  ON ai_messages (conversation_id, seq);
