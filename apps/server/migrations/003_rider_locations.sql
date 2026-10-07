-- Migration: 003_rider_locations
-- GPS audit trail for rider location history

CREATE TABLE IF NOT EXISTS rider_locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  rider_id     UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  lat          DECIMAL(10, 8) NOT NULL,
  lon          DECIMAL(11, 8) NOT NULL,
  heading      DECIMAL(5, 2),
  speed        DECIMAL(8, 2),
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rider_locations_delivery_id ON rider_locations(delivery_id);
CREATE INDEX IF NOT EXISTS idx_rider_locations_recorded_at ON rider_locations(recorded_at DESC);

-- Add zone_id to deliveries if not present
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS zone_id     UUID,
  ADD COLUMN IF NOT EXISTS claimed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ;
