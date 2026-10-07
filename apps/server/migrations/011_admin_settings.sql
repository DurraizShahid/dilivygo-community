CREATE TABLE IF NOT EXISTS admin_settings (
  id UUID PRIMARY KEY,
  avg_delivery_time_minutes INTEGER DEFAULT 30,
  auto_dispatch_delay_minutes INTEGER DEFAULT 5,
  max_search_radius_km FLOAT DEFAULT 15.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
