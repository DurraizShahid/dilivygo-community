-- Customer 1–5 star ratings for platform support tickets (one row per conversation)

CREATE TABLE IF NOT EXISTS support_ticket_ratings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  project_ref      TEXT NOT NULL,
  customer_id      UUID NOT NULL,
  ticket_subject   TEXT,
  stars            SMALLINT NOT NULL CHECK (stars >= 1 AND stars <= 5),
  comment          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_ratings_project_ref ON support_ticket_ratings(project_ref);
CREATE INDEX IF NOT EXISTS idx_support_ticket_ratings_created_at ON support_ticket_ratings(created_at DESC);

COMMENT ON TABLE support_ticket_ratings IS 'One rating per customer_support conversation; snapshot subject at submit time.';
