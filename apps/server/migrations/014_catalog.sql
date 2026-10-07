-- Catalog / Menu Management
-- Canonical schema for vendor products & categories (per project_ref)

create table if not exists categories (
  id uuid primary key,
  project_ref text not null,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists categories_project_ref_idx on categories(project_ref);
create unique index if not exists categories_project_ref_name_uq on categories(project_ref, name);

create table if not exists products (
  id uuid primary key,
  project_ref text not null,
  name text not null,
  description text,
  price_cents int not null,
  category text,
  image_url text,
  available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_project_ref_idx on products(project_ref);
create index if not exists products_project_ref_available_idx on products(project_ref, available);
create index if not exists products_project_ref_category_idx on products(project_ref, category);

