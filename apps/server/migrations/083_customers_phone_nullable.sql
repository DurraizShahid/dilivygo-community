-- Migration: 083_customers_phone_nullable
-- Email-only sign-in (OTP by email, demo-login skip) creates customers with
-- `email` set and no phone. Migration 077 added `customers_organization_phone_uq`
-- with `WHERE phone IS NOT NULL`, implying nullable phone, but the original
-- `000_core_schema` `phone TEXT NOT NULL` was never relaxed — inserts without
-- phone failed with PostgREST 400.

ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;

COMMENT ON COLUMN customers.phone IS
  'E.164 phone when the account is phone-based; NULL for email-only customers.';
