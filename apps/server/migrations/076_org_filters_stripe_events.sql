-- Stripe webhook idempotency rows: optional SaaS org (from metadata.projectRef → workspace)
ALTER TABLE stripe_events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS stripe_events_organization_id_idx ON stripe_events(organization_id);

-- Superadmin customer directory RPC: optional org filter (customers.organization_id)
CREATE OR REPLACE FUNCTION superadmin_customer_directory_search(
  p_search text DEFAULT NULL,
  p_project_ref text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_created_after timestamptz DEFAULT NULL,
  p_created_before timestamptz DEFAULT NULL,
  p_last_order_after timestamptz DEFAULT NULL,
  p_last_order_before timestamptz DEFAULT NULL,
  p_min_order_count integer DEFAULT NULL,
  p_max_order_count integer DEFAULT NULL,
  p_ltv_min_cents bigint DEFAULT NULL,
  p_ltv_max_cents bigint DEFAULT NULL,
  p_has_orders boolean DEFAULT NULL,
  p_sort text DEFAULT 'created_desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  phone text,
  name text,
  email text,
  project_ref text,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz,
  order_count integer,
  ltv_cents bigint,
  last_order_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT d.*
    FROM superadmin_customer_directory d
    WHERE
      (p_project_ref IS NULL OR btrim(p_project_ref) = '' OR d.project_ref IS NOT DISTINCT FROM p_project_ref)
      AND (
        p_organization_id IS NULL
        OR EXISTS (
          SELECT 1 FROM customers c_org
          WHERE c_org.id = d.id AND c_org.organization_id = p_organization_id
        )
      )
      AND (p_created_after IS NULL OR d.created_at >= p_created_after)
      AND (p_created_before IS NULL OR d.created_at <= p_created_before)
      AND (
        p_last_order_after IS NULL
        OR (d.last_order_at IS NOT NULL AND d.last_order_at >= p_last_order_after)
      )
      AND (
        p_last_order_before IS NULL
        OR (d.last_order_at IS NOT NULL AND d.last_order_at <= p_last_order_before)
      )
      AND (p_min_order_count IS NULL OR d.order_count >= p_min_order_count)
      AND (p_max_order_count IS NULL OR d.order_count <= p_max_order_count)
      AND (p_ltv_min_cents IS NULL OR d.ltv_cents >= p_ltv_min_cents)
      AND (p_ltv_max_cents IS NULL OR d.ltv_cents <= p_ltv_max_cents)
      AND (
        p_has_orders IS NULL
        OR (p_has_orders IS TRUE AND d.order_count > 0)
        OR (p_has_orders IS FALSE AND d.order_count = 0)
      )
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR position(lower(btrim(p_search)) IN lower(d.phone)) > 0
        OR position(lower(btrim(p_search)) IN lower(COALESCE(d.email, ''))) > 0
        OR position(lower(btrim(p_search)) IN lower(COALESCE(d.name, ''))) > 0
        OR position(lower(btrim(p_search)) IN lower(d.id::text)) > 0
      )
  ),
  counted AS (
    SELECT
      f.id,
      f.phone,
      f.name,
      f.email,
      f.project_ref,
      f.avatar_url,
      f.created_at,
      f.updated_at,
      f.order_count,
      f.ltv_cents,
      f.last_order_at,
      (COUNT(*) OVER ())::bigint AS total_count
    FROM filtered f
  )
  SELECT
    c.id,
    c.phone,
    c.name,
    c.email,
    c.project_ref,
    c.avatar_url,
    c.created_at,
    c.updated_at,
    c.order_count,
    c.ltv_cents,
    c.last_order_at,
    c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN p_sort = 'last_order_desc' THEN c.last_order_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'last_order_asc' THEN c.last_order_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'ltv_desc' THEN c.ltv_cents END DESC NULLS LAST,
    CASE WHEN p_sort = 'ltv_asc' THEN c.ltv_cents END ASC NULLS LAST,
    CASE WHEN p_sort = 'orders_desc' THEN c.order_count END DESC NULLS LAST,
    CASE WHEN p_sort = 'orders_asc' THEN c.order_count END ASC NULLS LAST,
    CASE WHEN p_sort = 'created_desc' THEN c.created_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'created_asc' THEN c.created_at END ASC NULLS LAST,
    CASE
      WHEN p_sort NOT IN (
        'last_order_desc', 'last_order_asc', 'ltv_desc', 'ltv_asc',
        'orders_desc', 'orders_asc', 'created_desc', 'created_asc'
      ) THEN c.created_at
    END DESC NULLS LAST,
    c.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;
