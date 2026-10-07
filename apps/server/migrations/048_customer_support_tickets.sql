-- Customer ↔ platform support conversations (superadmin inbox)

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_type_check
  CHECK (type IN ('customer_vendor', 'vendor_rider', 'customer_support'));

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS support_subject TEXT;

-- Placeholder UUID for participant_2 on customer_support rows (no single assigned agent)
-- Application constant must match: apps/server/lib/platform-constants.js

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_role_check;
ALTER TABLE messages ADD CONSTRAINT messages_sender_role_check
  CHECK (
    sender_role IS NULL
    OR sender_role IN ('customer', 'vendor', 'rider', 'admin', 'superadmin')
  );
