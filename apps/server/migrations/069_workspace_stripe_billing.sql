-- Migration: 069_workspace_stripe_billing
-- SaaS workspace Stripe Billing subscription state (trials + renewals), updated via webhooks.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS stripe_billing_customer_id TEXT;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS billing_subscription_status TEXT;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS billing_current_period_end TIMESTAMPTZ;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS billing_trial_end TIMESTAMPTZ;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS billing_price_id TEXT;

COMMENT ON COLUMN workspaces.stripe_billing_customer_id IS 'Stripe Customer id for SaaS workspace billing (Checkout/Portal).';
COMMENT ON COLUMN workspaces.stripe_subscription_id IS 'Stripe Subscription id for workspace SaaS plan.';
COMMENT ON COLUMN workspaces.billing_subscription_status IS 'Stripe subscription.status mirror: trialing, active, past_due, canceled, unpaid, incomplete, incomplete_expired, paused.';
COMMENT ON COLUMN workspaces.billing_current_period_end IS 'End of current billing period from Stripe subscription.';
COMMENT ON COLUMN workspaces.billing_trial_end IS 'Trial end from Stripe subscription.trial_end.';
COMMENT ON COLUMN workspaces.billing_price_id IS 'Primary recurring Stripe Price id on the subscription (first item).';

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_stripe_subscription_id_uq
  ON workspaces (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL AND stripe_subscription_id <> '';
