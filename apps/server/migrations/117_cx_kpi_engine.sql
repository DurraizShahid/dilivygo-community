-- Migration: 117_cx_kpi_engine
-- Canonical CX dimension taxonomy and tenant-scoped dimension management. Historical dimension mapping stays version-aware via frozen survey_version.schema (questions[].dimensions).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Dimensions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cx_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cx_dimensions_org_key_unique UNIQUE (organization_id, key)
);

CREATE INDEX IF NOT EXISTS cx_dimensions_org_idx
  ON cx_dimensions (organization_id, sort_order);

-- Grants
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='cx_dimensions') THEN
    REVOKE ALL ON TABLE cx_dimensions FROM anon, authenticated;
    GRANT ALL ON TABLE cx_dimensions TO service_role;
  END IF;
END $$;

COMMENT ON TABLE cx_dimensions IS 'Canonical CX dimensions per org (food_quality, wait_time, etc). Survey questions map to dimensions via version.schema questions[].dimensions with weight, version-aware.';

-- Seed canonical dimensions for existing organizations (idempotent, per org)
DO $$
DECLARE
  org RECORD;
  dims TEXT[] := ARRAY[
    'food_quality', 'taste', 'temperature', 'portion', 'packaging',
    'staff_behavior', 'service', 'wait_time', 'cleanliness', 'ambience',
    'delivery_speed', 'rider_behavior', 'order_accuracy', 'value'
  ];
  names TEXT[] := ARRAY[
    'Food Quality', 'Taste', 'Temperature', 'Portion', 'Packaging',
    'Staff Behavior', 'Service', 'Wait Time', 'Cleanliness', 'Ambience',
    'Delivery Speed', 'Rider Behavior', 'Order Accuracy', 'Value'
  ];
  i INT;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    FOR i IN 1..array_length(dims, 1) LOOP
      INSERT INTO cx_dimensions (organization_id, key, name, sort_order, is_active)
      VALUES (org.id, dims[i], names[i], i, true)
      ON CONFLICT (organization_id, key) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
