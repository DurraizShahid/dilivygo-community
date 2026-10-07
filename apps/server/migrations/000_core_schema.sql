-- Migration: 000_core_schema
-- Canonical base schema for Dilivygo backend.
-- This repo previously relied on out-of-band Supabase table creation; this migration
-- makes the schema reproducible from SQL migrations.

-- Extensions
create extension if not exists pgcrypto;

-- ─── Users (admin/vendor/rider) ───────────────────────────────────────────────
create table if not exists app_users (
  id uuid primary key,
  email text not null,
  password_hash text not null,
  role text not null check (role in ('admin', 'vendor', 'rider')),
  project_ref text not null,
  totp_enabled boolean not null default false,
  totp_secret text,
  created_at timestamptz not null default now()
);
create unique index if not exists app_users_email_uq on app_users(lower(email));
create index if not exists app_users_project_ref_idx on app_users(project_ref);
create index if not exists app_users_role_idx on app_users(role);

-- ─── Customers ────────────────────────────────────────────────────────────────
create table if not exists customers (
  id uuid primary key,
  phone text not null,
  name text,
  email text,
  project_ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists customers_project_ref_phone_uq on customers(project_ref, phone);
create index if not exists customers_project_ref_idx on customers(project_ref);

-- ─── Workspaces (vendor storefront profile) ───────────────────────────────────
create table if not exists workspaces (
  id uuid primary key,
  project_ref text not null unique,
  name text not null,
  description text,
  logo_url text,
  banner_url text,
  address text,
  phone text,
  lat decimal(10, 8),
  lon decimal(11, 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspaces_project_ref_idx on workspaces(project_ref);

-- Optional CMS-ish blocks used by workspace.controller.js
create table if not exists block_content (
  id uuid primary key,
  project_ref text not null,
  block_id text not null,
  content jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_ref, block_id)
);
create index if not exists block_content_project_ref_idx on block_content(project_ref);

-- ─── Orders ───────────────────────────────────────────────────────────────────
create table if not exists orders (
  id uuid primary key,
  project_ref text not null,
  customer_id uuid references customers(id) on delete set null,
  status text not null,
  payment_status text not null default 'unpaid',
  payment_intent_id text,
  total_cents integer not null default 0,
  scheduled_for timestamptz,
  -- refund/cancel columns added in later migration too; keep here as canonical
  refund_amount_cents integer,
  refund_reason text,
  cancellation_reason text,
  cancelled_by text,
  -- lifecycle columns
  prep_time_minutes integer,
  sla_deadline timestamptz,
  sla_breached boolean not null default false,
  delivery_mode text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Canonical status constraint (replaces older pending/accepted_by_vendor/delivered set)
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (
  status in (
    'placed','accepted','rejected','preparing','ready',
    'assigned','picked_up','arrived','completed','cancelled','scheduled'
  )
);

alter table orders drop constraint if exists orders_payment_status_check;
alter table orders add constraint orders_payment_status_check check (
  payment_status in ('unpaid','paid','refunded','partially_refunded')
);

create index if not exists orders_project_ref_idx on orders(project_ref);
create index if not exists orders_customer_id_idx on orders(customer_id);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_created_at_idx on orders(created_at desc);

create table if not exists order_items (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid,
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0)
);
create index if not exists order_items_order_id_idx on order_items(order_id);

-- ─── Deliveries ───────────────────────────────────────────────────────────────
create table if not exists deliveries (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  rider_id uuid references app_users(id) on delete set null,
  status text not null default 'pending',
  zone_id uuid,
  eta_minutes integer,
  claimed_at timestamptz,
  updated_at timestamptz,
  -- external rider fields (also added later)
  external_rider_name text,
  external_rider_phone text,
  is_external boolean not null default false,
  created_at timestamptz not null default now()
);
alter table deliveries drop constraint if exists deliveries_status_check;
alter table deliveries add constraint deliveries_status_check check (
  status in ('pending','assigned','picked_up','arrived','delivered')
);
create index if not exists deliveries_order_id_idx on deliveries(order_id);
create index if not exists deliveries_rider_id_idx on deliveries(rider_id);

-- ─── Cart ─────────────────────────────────────────────────────────────────────
create table if not exists cart_sessions (
  id uuid primary key,
  project_ref text not null,
  customer_id uuid references customers(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cart_sessions_project_ref_idx on cart_sessions(project_ref);
create index if not exists cart_sessions_customer_id_idx on cart_sessions(customer_id);

create table if not exists cart_items (
  id uuid primary key,
  session_id uuid not null references cart_sessions(id) on delete cascade,
  product_id uuid,
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now()
);
create index if not exists cart_items_session_id_idx on cart_items(session_id);
create index if not exists cart_items_product_id_idx on cart_items(product_id);

