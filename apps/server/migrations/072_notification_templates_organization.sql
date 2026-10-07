-- Scope notification templates per SaaS organization (white-label email/push copy).

ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notification_templates_organization_id_idx
  ON notification_templates (organization_id)
  WHERE organization_id IS NOT NULL;

ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_slug_key;

DROP INDEX IF EXISTS idx_notification_templates_slug;

DO $$
DECLARE
  org_count INTEGER;
BEGIN
  SELECT COUNT(*)::INT INTO org_count FROM organizations;
  IF org_count = 0 THEN
    RETURN;
  END IF;

  INSERT INTO notification_templates (
    id, slug, name, description, channel,
    email_subject, email_html, push_title, push_body, is_active,
    created_at, updated_at, organization_id
  )
  SELECT
    gen_random_uuid(),
    t.slug,
    t.name,
    t.description,
    t.channel,
    t.email_subject,
    t.email_html,
    t.push_title,
    t.push_body,
    t.is_active,
    t.created_at,
    t.updated_at,
    o.id
  FROM notification_templates t
  CROSS JOIN organizations o
  WHERE t.organization_id IS NULL;

  DELETE FROM notification_templates WHERE organization_id IS NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_org_slug_uq
  ON notification_templates (organization_id, slug)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_slug_global_uq
  ON notification_templates (slug)
  WHERE organization_id IS NULL;

COMMENT ON COLUMN notification_templates.organization_id IS 'SaaS org; NULL = legacy single-tenant global templates when no organizations exist.';
