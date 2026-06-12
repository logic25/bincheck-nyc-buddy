-- =====================================================================
-- Staff/analyst role wiring
-- =====================================================================
-- Adds 'analyst' and 'sales' to app_role enum, expands RLS so analysts
-- can read + update all dd_reports (run the back-office workflow), and
-- gives admins a CRUD policy on user_roles so the team page can manage
-- assignments without service-role keys.
--
-- Existing roles: admin, user
-- New roles:      analyst, sales
--
-- Capability matrix (dd_reports):
--   admin   - full read/update/delete (already had SELECT; now extended)
--   analyst - read all, update all (workflow: status, ai_analysis, notes)
--   sales   - read all (visibility into pipeline, no edits)
--   user    - own rows only (unchanged)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extend app_role enum
-- ---------------------------------------------------------------------
-- Postgres requires ADD VALUE to run outside a transaction block when
-- used with IF NOT EXISTS; Supabase migrations run each file in a tx,
-- so we guard with a DO block that checks pg_enum first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'analyst'
      AND enumtypid = 'public.app_role'::regtype
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'analyst';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'sales'
      AND enumtypid = 'public.app_role'::regtype
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'sales';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Helper: any staff role (admin OR analyst OR sales)
-- ---------------------------------------------------------------------
-- Cheap convenience wrapper so app code can guard staff-only UI with a
-- single RPC call. SECURITY DEFINER to avoid RLS recursion on user_roles.
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'analyst', 'sales')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. RLS on user_roles - admin CRUD (so the team page can assign roles)
-- ---------------------------------------------------------------------
-- The existing migration only granted users SELECT on their own roles.
-- We add admin INSERT/UPDATE/DELETE so the admin team UI works without
-- requiring a service-role edge function.

CREATE POLICY "Admins can view all user_roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert user_roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update user_roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete user_roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- 4. dd_reports - extend admin scope + add analyst/sales access
-- ---------------------------------------------------------------------
-- Existing: "Admins can view all dd reports" (SELECT only).
-- Add UPDATE + DELETE for admin so they can correct any report.

CREATE POLICY "Admins can update all dd reports"
  ON public.dd_reports FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete all dd reports"
  ON public.dd_reports FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Analysts: read + update everything (this is their day-to-day work).
CREATE POLICY "Analysts can view all dd reports"
  ON public.dd_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'analyst'));

CREATE POLICY "Analysts can update all dd reports"
  ON public.dd_reports FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'analyst'))
  WITH CHECK (public.has_role(auth.uid(), 'analyst'));

-- Sales: read-only visibility into the report pipeline.
CREATE POLICY "Sales can view all dd reports"
  ON public.dd_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'sales'));

-- ---------------------------------------------------------------------
-- 5. profiles - analyst/sales can see client profiles for outreach
-- ---------------------------------------------------------------------
CREATE POLICY "Analysts can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'analyst'));

CREATE POLICY "Sales can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'sales'));

-- ---------------------------------------------------------------------
-- 6. saved_reports - analysts can audit any client's saved reports
-- ---------------------------------------------------------------------
CREATE POLICY "Analysts can view all saved reports"
  ON public.saved_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'analyst'));

-- ---------------------------------------------------------------------
-- 7. order_leads - sales needs full CRUD (it's their pipeline)
-- ---------------------------------------------------------------------
-- Existing: anyone authenticated can SELECT, admin can UPDATE.
-- Sales gets UPDATE so they can mark leads converted, attach notes.
CREATE POLICY "Sales can update order leads"
  ON public.order_leads FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'sales'))
  WITH CHECK (public.has_role(auth.uid(), 'sales'));
