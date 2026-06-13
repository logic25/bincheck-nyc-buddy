-- Security hardening pass (PR #16)
--
-- Addresses findings from the Lovable/Supabase security scan:
--   CRITICAL: order_leads PII readable by any authenticated user
--   CRITICAL: bug-attachments publicly readable on the open internet
--   CRITICAL: get_users_with_email() callable by any authenticated user (auth.users PII leak)
--   WARNING: bug-attachments has no UPDATE/DELETE storage policies
--   WARNING: check_rate_limit() / log_audit() granted to anon (DoS + audit-log poisoning)
--   WARNING: cleanup_rate_limit_buckets() callable by any authenticated user
--   WARNING: Function search_path mutable on several SECURITY DEFINER functions
--   NOTE:    roadmap_items FOR ALL policy is intentional (admin-only by design)
--
-- The open-redirect in supabase/functions/track-cta-click is fixed in
-- application code, not SQL. The "Leaked Password Protection Disabled" item
-- is a Supabase Auth dashboard toggle and cannot be set via migration.

BEGIN;

-- =============================================================================
-- 1. order_leads — replace overly-permissive SELECT policy
-- =============================================================================
-- The original "Authenticated users can view leads" policy used USING (true),
-- so anyone with a Supabase session token could SELECT every lead's PII.
-- Restrict to staff (sales + admin).

DROP POLICY IF EXISTS "Authenticated users can view leads" ON public.order_leads;

CREATE POLICY "Staff can view order leads"
  ON public.order_leads
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- =============================================================================
-- 2. get_users_with_email() — lock down to admins only
-- =============================================================================
-- This SECURITY DEFINER function returns every row in auth.users. The original
-- grant let any authenticated user invoke it. Move the access check inside
-- the function and revoke broad grants.

REVOKE EXECUTE ON FUNCTION public.get_users_with_email() FROM PUBLIC, authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_users_with_email()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Defense in depth: even if EXECUTE is accidentally re-granted, only admins
  -- can pull this data.
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'permission denied: admin role required';
  END IF;

  RETURN QUERY
    SELECT au.id, au.email::text, au.created_at
    FROM auth.users au
    ORDER BY au.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_users_with_email() TO authenticated;

-- =============================================================================
-- 3. bug-attachments storage bucket — make private + tighten policies
-- =============================================================================
-- Originally a public bucket with anonymous SELECT and no UPDATE/DELETE rules.
-- That means: anyone on the internet could read attachments, and any signed-in
-- user could overwrite or delete any file. Now: private bucket, admins read
-- everything, users read only files they uploaded, and only the uploader (or
-- an admin) can modify or delete.

UPDATE storage.buckets SET public = false WHERE id = 'bug-attachments';

DROP POLICY IF EXISTS "Anyone can view bug attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload bug attachments" ON storage.objects;

CREATE POLICY "Users can upload bug attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'bug-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view own bug attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'bug-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "Users can update own bug attachments"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'bug-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "Users can delete own bug attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'bug-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- =============================================================================
-- 4. check_rate_limit / log_audit — remove anon grants
-- =============================================================================
-- Granted to anon, these can be abused: anon DoS by burning rate-limit buckets
-- for known emails, or by flooding the audit log. They're called from RPCs
-- like submit_lead() which are themselves SECURITY DEFINER and run as the
-- function owner — so they don't need to be callable by anon directly.

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb) FROM anon;

-- =============================================================================
-- 5. cleanup_rate_limit_buckets — admin only
-- =============================================================================
-- Wipes rate-limit state. Should never be callable by regular users.

REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_buckets() FROM PUBLIC, authenticated, anon;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_buckets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'permission denied: admin role required';
  END IF;

  DELETE FROM public.rate_limit_buckets
  WHERE window_start < now() - interval '7 days';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_buckets() TO authenticated;

-- =============================================================================
-- 6. Function search_path hardening
-- =============================================================================
-- Mutable search_path on SECURITY DEFINER functions is a known privilege-
-- escalation vector (an attacker who can create objects in any schema on the
-- search_path can hijack the function). Force a fixed, safe search_path.
-- Functions already declared with SET search_path are left alone.

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c
        WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      fn.nspname, fn.proname, fn.args
    );
  END LOOP;
END;
$$;

-- =============================================================================
-- 7. roadmap_items — documented as intentional admin-only
-- =============================================================================
-- The scanner flagged "Roadmap items are unreadable by non-admins but no
-- public read policy exists". This is by design. No code change.
COMMENT ON TABLE public.roadmap_items IS
  'Internal product roadmap. Admin-only access by policy. Non-admin invisibility is intentional.';

COMMIT;
