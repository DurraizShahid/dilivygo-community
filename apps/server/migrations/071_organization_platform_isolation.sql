-- Per-organization platform config and marketing isolation (white-label SaaS).
-- organization_platform_settings: key/value overrides; merge with platform_settings in app when absent.

CREATE TABLE IF NOT EXISTS organization_platform_settings (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  value           TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, key)
);

CREATE INDEX IF NOT EXISTS organization_platform_settings_key_idx
  ON organization_platform_settings (key);

COMMENT ON TABLE organization_platform_settings IS 'Per-SaaS-org overrides for keys mirrored from platform_settings; merged at read time.';

-- Seed each existing organization with a copy of global platform_settings (idempotent).
INSERT INTO organization_platform_settings (organization_id, key, value, updated_at)
SELECT o.id, p.key, p.value, NOW()
FROM organizations o
CROSS JOIN platform_settings p
ON CONFLICT (organization_id, key) DO NOTHING;

-- Banners: scope per organization (nullable = legacy rows before assignment).
ALTER TABLE platform_banners
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS platform_banners_organization_id_idx
  ON platform_banners (organization_id)
  WHERE organization_id IS NOT NULL;

-- Duplicate legacy global banners (NULL org) into each organization, then remove globals if any orgs exist.
DO $$
DECLARE
  org_count INTEGER;
BEGIN
  SELECT COUNT(*)::INT INTO org_count FROM organizations;
  IF org_count = 0 THEN
    RETURN;
  END IF;

  INSERT INTO platform_banners (
    id, title, subtitle, cta_text, cta_link, image_url, image_urls, carousel_enabled,
    image_scale, image_resize, image_aspect_preset, placement, bg_gradient, text_color,
    sort_order, is_active, starts_at, ends_at, created_at, updated_at, organization_id
  )
  SELECT
    gen_random_uuid(),
    b.title,
    b.subtitle,
    b.cta_text,
    b.cta_link,
    b.image_url,
    b.image_urls,
    b.carousel_enabled,
    b.image_scale,
    b.image_resize,
    b.image_aspect_preset,
    b.placement,
    b.bg_gradient,
    b.text_color,
    b.sort_order,
    b.is_active,
    b.starts_at,
    b.ends_at,
    b.created_at,
    b.updated_at,
    o.id
  FROM platform_banners b
  CROSS JOIN organizations o
  WHERE b.organization_id IS NULL;

  DELETE FROM platform_banners WHERE organization_id IS NULL;
END $$;

-- Promotional push campaigns (superadmin): per-org copies.
ALTER TABLE promotional_notifications
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS promotional_notifications_organization_id_idx
  ON promotional_notifications (organization_id)
  WHERE organization_id IS NOT NULL;

DO $$
DECLARE
  org_count INTEGER;
BEGIN
  SELECT COUNT(*)::INT INTO org_count FROM organizations;
  IF org_count = 0 THEN
    RETURN;
  END IF;

  INSERT INTO promotional_notifications (
    id, title, body, target_audience, data, status, sent_count, failed_count, total_tokens,
    created_by, sent_at, created_at, updated_at, organization_id
  )
  SELECT
    gen_random_uuid(),
    n.title,
    n.body,
    n.target_audience,
    n.data,
    n.status,
    n.sent_count,
    n.failed_count,
    n.total_tokens,
    n.created_by,
    n.sent_at,
    n.created_at,
    n.updated_at,
    o.id
  FROM promotional_notifications n
  CROSS JOIN organizations o
  WHERE n.organization_id IS NULL;

  DELETE FROM promotional_notifications WHERE organization_id IS NULL;
END $$;
