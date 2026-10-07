-- Idempotency for Stripe webhooks

create table if not exists stripe_events (
  event_id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);

create index if not exists stripe_events_type_idx on stripe_events(type);

