
-- 1. Remove client INSERT path on audit_log; only SECURITY DEFINER log_audit() should write.
DROP POLICY IF EXISTS "Users can insert their own audit entries" ON public.audit_log;

-- 2. Replace public-role policies that check auth.role()='service_role' with proper
--    service_role-targeted policies on email tables.
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role manages send log" ON public.email_send_log
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role manages send state" ON public.email_send_state
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role manages unsubscribe tokens" ON public.email_unsubscribe_tokens
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role manages suppressed emails" ON public.suppressed_emails
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. cross_sell_impressions: explicitly scope writes to service_role only.
CREATE POLICY "Service role manages cross sell impressions" ON public.cross_sell_impressions
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Convert the compliance_snapshot_latest view to SECURITY INVOKER so it
--    runs under the querying user's RLS context, not the view owner's.
ALTER VIEW public.compliance_snapshot_latest SET (security_invoker = true);

-- 5. Pin search_path on the remaining function flagged by the linter.
ALTER FUNCTION public.prevent_audit_log_mutation() SET search_path = public;
