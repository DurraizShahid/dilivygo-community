-- Migration: 075_audit_log_organization
-- Optional SaaS org scope on audit rows (for operator filtering); legacy rows stay NULL.

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_organization_id ON audit_log(organization_id);
