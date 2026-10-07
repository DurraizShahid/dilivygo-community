-- Migration: 115_ai_knowledge
-- Tenant-scoped knowledge base for AI retrieval (RAG).
-- organization_id NULL + project_ref NULL = platform-global approved content.
-- Rows never carry FKs to organizations/workspaces so synthetic marketplace
-- ids and not-yet-provisioned tenants ingest without ordering hazards.

CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  project_ref TEXT,
  source TEXT NOT NULL CHECK (source IN ('help', 'policy', 'onboarding', 'support', 'product')),
  source_ref TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'organization' CHECK (visibility IN ('platform', 'organization', 'workspace')),
  roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_knowledge_documents_source_uq UNIQUE (source, source_ref)
);

CREATE INDEX IF NOT EXISTS ai_knowledge_documents_scope_idx
  ON ai_knowledge_documents (organization_id, project_ref);

CREATE INDEX IF NOT EXISTS ai_knowledge_documents_live_idx
  ON ai_knowledge_documents (source, deleted_at);

CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
  organization_id UUID,
  project_ref TEXT,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  embedding JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_knowledge_chunks_doc_idx_uq UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_scope_idx
  ON ai_knowledge_chunks (organization_id, project_ref);

CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_doc_idx
  ON ai_knowledge_chunks (document_id);
