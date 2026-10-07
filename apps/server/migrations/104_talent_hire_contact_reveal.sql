-- Hiring is an explicit recruiting action and should unlock candidate contact
-- details for that organization. Record the reveal in the same immutable audit
-- table used by the manual reveal action.

CREATE OR REPLACE FUNCTION public.talent_record_hire_contact_reveal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.talent_contact_reveals r
    WHERE r.organization_id = NEW.organization_id
      AND r.candidate_id = NEW.candidate_id
  ) THEN
    INSERT INTO public.talent_contact_reveals (
      organization_id,
      candidate_id,
      revealed_by_clerk_user_id,
      reason
    ) VALUES (
      NEW.organization_id,
      NEW.candidate_id,
      NEW.hired_by_clerk_user_id,
      'hire'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS talent_hire_reveals_contact ON public.talent_hires;
CREATE TRIGGER talent_hire_reveals_contact
  AFTER INSERT ON public.talent_hires
  FOR EACH ROW EXECUTE FUNCTION public.talent_record_hire_contact_reveal();
