ALTER TABLE vendor_settings ADD COLUMN IF NOT EXISTS auto_dispatch_delay_minutes INTEGER DEFAULT 0;
