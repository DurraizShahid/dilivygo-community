-- Migration: 086_integration_requests
-- Track requests for third-party integrations from SaaS organizations.

create table if not exists integration_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  integration_name text not null,
  integration_category text not null,
  requester_name text,
  requester_email text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists integration_requests_organization_id_idx on integration_requests(organization_id);
create index if not exists integration_requests_status_idx on integration_requests(status);
