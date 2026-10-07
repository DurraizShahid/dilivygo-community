-- Dilivygo Talent: global restaurant-worker network with tenant-scoped recruiting state.
-- Candidate identity/profile data is platform-global. Recruiter pipeline data is always
-- scoped to an organization and must never be exposed across tenants.

CREATE TABLE IF NOT EXISTS public.talent_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref TEXT NOT NULL UNIQUE DEFAULT ('tal_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  email TEXT NOT NULL,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  headline TEXT,
  bio TEXT,
  city TEXT,
  region TEXT,
  country_code TEXT,
  postal_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  years_experience INTEGER NOT NULL DEFAULT 0 CHECK (years_experience >= 0 AND years_experience <= 80),
  desired_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  languages TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  availability TEXT NOT NULL DEFAULT 'immediately'
    CHECK (availability IN ('immediately', 'two_weeks', 'one_month', 'not_looking')),
  employment_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  avatar_url TEXT,
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('visible', 'private')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),
  consented_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
);

CREATE UNIQUE INDEX IF NOT EXISTS talent_candidates_email_lower_uq
  ON public.talent_candidates (lower(email));
CREATE INDEX IF NOT EXISTS talent_candidates_location_idx
  ON public.talent_candidates (country_code, city);
CREATE INDEX IF NOT EXISTS talent_candidates_visibility_idx
  ON public.talent_candidates (visibility, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS talent_candidates_roles_gin_idx
  ON public.talent_candidates USING GIN (desired_roles);
CREATE INDEX IF NOT EXISTS talent_candidates_skills_gin_idx
  ON public.talent_candidates USING GIN (skills);

CREATE TABLE IF NOT EXISTS public.talent_experience (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.talent_candidates(id) ON DELETE CASCADE,
  employer_name TEXT NOT NULL,
  role_title TEXT NOT NULL,
  city TEXT,
  country_code TEXT,
  started_on DATE,
  ended_on DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on)
);
CREATE INDEX IF NOT EXISTS talent_experience_candidate_idx
  ON public.talent_experience (candidate_id, started_on DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.talent_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.talent_candidates(id) ON DELETE CASCADE,
  referee_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  employer_name TEXT,
  referee_email TEXT,
  referee_phone TEXT,
  reference_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS talent_references_candidate_idx
  ON public.talent_references (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS talent_references_status_idx
  ON public.talent_references (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.talent_org_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.talent_candidates(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'saved'
    CHECK (status IN ('saved', 'screening', 'interview', 'offered', 'hired', 'rejected', 'archived')),
  notes TEXT,
  assigned_shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  created_by_clerk_user_id TEXT,
  updated_by_clerk_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS talent_org_candidates_org_status_idx
  ON public.talent_org_candidates (organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS talent_org_candidates_candidate_idx
  ON public.talent_org_candidates (candidate_id);

CREATE TABLE IF NOT EXISTS public.talent_contact_reveals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.talent_candidates(id) ON DELETE CASCADE,
  revealed_by_clerk_user_id TEXT,
  revealed_by_superadmin_id UUID REFERENCES public.superadmins(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (organization_id IS NOT NULL OR revealed_by_superadmin_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS talent_contact_reveals_org_candidate_idx
  ON public.talent_contact_reveals (organization_id, candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS talent_contact_reveals_candidate_idx
  ON public.talent_contact_reveals (candidate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.talent_hires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.talent_candidates(id) ON DELETE CASCADE,
  shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  hired_by_clerk_user_id TEXT,
  role_title TEXT,
  start_date DATE,
  notes TEXT,
  hired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS talent_hires_org_idx
  ON public.talent_hires (organization_id, hired_at DESC);
CREATE INDEX IF NOT EXISTS talent_hires_candidate_idx
  ON public.talent_hires (candidate_id, hired_at DESC);

CREATE OR REPLACE FUNCTION public.talent_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS talent_candidates_touch_updated_at ON public.talent_candidates;
CREATE TRIGGER talent_candidates_touch_updated_at
  BEFORE UPDATE ON public.talent_candidates
  FOR EACH ROW EXECUTE FUNCTION public.talent_touch_updated_at();
DROP TRIGGER IF EXISTS talent_experience_touch_updated_at ON public.talent_experience;
CREATE TRIGGER talent_experience_touch_updated_at
  BEFORE UPDATE ON public.talent_experience
  FOR EACH ROW EXECUTE FUNCTION public.talent_touch_updated_at();
DROP TRIGGER IF EXISTS talent_references_touch_updated_at ON public.talent_references;
CREATE TRIGGER talent_references_touch_updated_at
  BEFORE UPDATE ON public.talent_references
  FOR EACH ROW EXECUTE FUNCTION public.talent_touch_updated_at();
DROP TRIGGER IF EXISTS talent_org_candidates_touch_updated_at ON public.talent_org_candidates;
CREATE TRIGGER talent_org_candidates_touch_updated_at
  BEFORE UPDATE ON public.talent_org_candidates
  FOR EACH ROW EXECUTE FUNCTION public.talent_touch_updated_at();

-- Search is intentionally public-safe: it never returns candidate email/phone,
-- referee contact details, or another organization's recruiting notes.
CREATE OR REPLACE FUNCTION public.search_talent_candidates(
  p_organization_id UUID,
  p_search TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_country_code TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_skill TEXT DEFAULT NULL,
  p_availability TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_radius_km DOUBLE PRECISION DEFAULT NULL,
  p_limit INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  public_ref TEXT,
  first_name TEXT,
  last_name TEXT,
  headline TEXT,
  bio TEXT,
  city TEXT,
  region TEXT,
  country_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  years_experience INTEGER,
  desired_roles TEXT[],
  skills TEXT[],
  languages TEXT[],
  availability TEXT,
  employment_types TEXT[],
  avatar_url TEXT,
  pipeline_status TEXT,
  experience_count BIGINT,
  reference_count BIGINT,
  verified_reference_count BIGINT,
  distance_km DOUBLE PRECISION,
  total_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      c.*,
      toc.status AS recruiter_status,
      CASE
        WHEN p_latitude IS NULL OR p_longitude IS NULL OR c.latitude IS NULL OR c.longitude IS NULL
          THEN NULL::DOUBLE PRECISION
        ELSE 6371.0 * acos(
          least(1.0, greatest(-1.0,
            cos(radians(p_latitude)) * cos(radians(c.latitude)) *
            cos(radians(c.longitude) - radians(p_longitude)) +
            sin(radians(p_latitude)) * sin(radians(c.latitude))
          ))
        )
      END AS calculated_distance_km
    FROM public.talent_candidates c
    LEFT JOIN public.talent_org_candidates toc
      ON toc.candidate_id = c.id
     AND toc.organization_id = p_organization_id
    WHERE c.status = 'active'
      AND c.visibility = 'visible'
      AND c.consented_at IS NOT NULL
      AND (p_city IS NULL OR trim(p_city) = '' OR c.city ILIKE '%' || trim(p_city) || '%')
      AND (p_country_code IS NULL OR trim(p_country_code) = '' OR upper(c.country_code) = upper(trim(p_country_code)))
      AND (p_availability IS NULL OR trim(p_availability) = '' OR c.availability = trim(p_availability))
      AND (
        p_role IS NULL OR trim(p_role) = '' OR EXISTS (
          SELECT 1 FROM unnest(c.desired_roles) AS role_value
          WHERE role_value ILIKE '%' || trim(p_role) || '%'
        )
      )
      AND (
        p_skill IS NULL OR trim(p_skill) = '' OR EXISTS (
          SELECT 1 FROM unnest(c.skills) AS skill_value
          WHERE skill_value ILIKE '%' || trim(p_skill) || '%'
        )
      )
      AND (
        p_search IS NULL OR trim(p_search) = '' OR
        concat_ws(' ', c.first_name, c.last_name) ILIKE '%' || trim(p_search) || '%' OR
        c.headline ILIKE '%' || trim(p_search) || '%' OR
        c.bio ILIKE '%' || trim(p_search) || '%' OR
        c.city ILIKE '%' || trim(p_search) || '%' OR
        EXISTS (SELECT 1 FROM unnest(c.desired_roles) r WHERE r ILIKE '%' || trim(p_search) || '%') OR
        EXISTS (SELECT 1 FROM unnest(c.skills) s WHERE s ILIKE '%' || trim(p_search) || '%')
      )
  ),
  filtered AS (
    SELECT * FROM base
    WHERE p_radius_km IS NULL
       OR calculated_distance_km IS NULL
       OR calculated_distance_km <= greatest(1.0, least(p_radius_km, 500.0))
  )
  SELECT
    f.id,
    f.public_ref,
    f.first_name,
    f.last_name,
    f.headline,
    f.bio,
    f.city,
    f.region,
    f.country_code,
    f.latitude,
    f.longitude,
    f.years_experience,
    f.desired_roles,
    f.skills,
    f.languages,
    f.availability,
    f.employment_types,
    f.avatar_url,
    f.recruiter_status AS pipeline_status,
    (SELECT count(*) FROM public.talent_experience e WHERE e.candidate_id = f.id) AS experience_count,
    (SELECT count(*) FROM public.talent_references r WHERE r.candidate_id = f.id) AS reference_count,
    (SELECT count(*) FROM public.talent_references r WHERE r.candidate_id = f.id AND r.status = 'verified') AS verified_reference_count,
    f.calculated_distance_km AS distance_km,
    count(*) OVER() AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN f.calculated_distance_km IS NULL THEN 1 ELSE 0 END,
    f.calculated_distance_km ASC NULLS LAST,
    f.updated_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 30), 100))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;

-- Candidate records contain PII and must only be accessed by the API service role.
ALTER TABLE public.talent_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_org_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_contact_reveals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_hires ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.search_talent_candidates(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_talent_candidates(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER) TO service_role;
