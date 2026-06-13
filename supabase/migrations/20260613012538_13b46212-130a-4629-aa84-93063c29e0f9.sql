BEGIN;

DROP POLICY IF EXISTS "Authenticated users can view leads" ON public.order_leads;
DROP POLICY IF EXISTS "Staff can view order leads" ON public.order_leads;
CREATE POLICY "Admins can view order leads"
  ON public.order_leads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE EXECUTE ON FUNCTION public.get_users_with_email() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_users_with_email()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
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

DROP POLICY IF EXISTS "Anyone can view bug attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload bug attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload bug attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own bug attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own bug attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own bug attachments" ON storage.objects;

CREATE POLICY "Users can upload bug attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bug-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Users can view own bug attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'bug-attachments'
    AND ((storage.foldername(name))[1] = auth.uid()::text
         OR public.has_role(auth.uid(), 'admin'::app_role))
  );
CREATE POLICY "Users can update own bug attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'bug-attachments'
    AND ((storage.foldername(name))[1] = auth.uid()::text
         OR public.has_role(auth.uid(), 'admin'::app_role))
  );
CREATE POLICY "Users can delete own bug attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'bug-attachments'
    AND ((storage.foldername(name))[1] = auth.uid()::text
         OR public.has_role(auth.uid(), 'admin'::app_role))
  );

DO $$
DECLARE fn record;
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

COMMENT ON TABLE public.roadmap_items IS
  'Internal product roadmap. Admin-only access by policy. Non-admin invisibility is intentional.';

COMMIT;