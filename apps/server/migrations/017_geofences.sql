-- Migration: 017_geofences
-- Adds polygon geofence support for shops and riders.
-- Shops define a delivery zone polygon; riders define their operating zone polygon.
-- Replaces the simple delivery_radius_km circle with drawn GeoJSON polygons.

-- ─── Add delivery geofence to shops ───────────────────────────────────────────
ALTER TABLE shops ADD COLUMN IF NOT EXISTS delivery_geofence jsonb;

-- ─── Rider geofences table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rider_geofences (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  project_ref text NOT NULL,
  geofence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS rider_geofences_user_id_idx ON rider_geofences(user_id);
CREATE INDEX IF NOT EXISTS rider_geofences_project_ref_idx ON rider_geofences(project_ref);
