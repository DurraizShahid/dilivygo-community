-- Superadmin customer directory: aggregates + search RPC + saved filter views

-- ─── Directory view (order stats per customer) ────────────────────────────────
CREATE OR REPLACE VIEW superadmin_customer_directory AS
SELECT
  c.id,
  c.phone,
  c.name,
  c.email,
  c.project_ref,
  c.avatar_url,
  c.created_at,
  c.updated_at,
  COALESCE(a.order_count, 0)::integer AS order_count,
  COALESCE(a.ltv_cents, 0)::bigint AS ltv_cents,
  a.last_order_at
FROM customers c
LEFT JOIN (
  SELECT
    customer_id,
    COUNT(*)::integer AS order_count,
    SUM(CASE WHEN status = 'completed' THEN COALESCE(total_cents, 0) ELSE 0 END)::bigint AS ltv_cents,
    MAX(created_at) AS last_order_at
  FROM orders
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
) a ON a.customer_id = c.id;

-- ─── RPC: filtered + sorted page + total_count ────────────────────────────────
CREATE OR REPLACE FUNCTION superadmin_customer_directory_search(
  p_search text DEFAULT NULL,
  p_project_ref text DEFAULT NULL,
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

-- ─── Saved filter views (per superadmin) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS superadmin_customer_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  superadmin_id uuid NOT NULL REFERENCES superadmins (id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sa_cust_saved_views_superadmin_idx
  ON superadmin_customer_saved_views (superadmin_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS sa_cust_saved_views_name_uq
  ON superadmin_customer_saved_views (superadmin_id, lower(name));
