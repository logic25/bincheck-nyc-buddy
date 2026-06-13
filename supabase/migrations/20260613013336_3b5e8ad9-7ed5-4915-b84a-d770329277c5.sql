BEGIN;

-- Trigger/internal functions: should not be callable directly
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_dd_reports_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_user_roles_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_audit_log_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- pgmq queue helpers: edge-function/service-role only
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

-- Redundant service-role catch-all policies (service_role bypasses RLS)
DROP POLICY IF EXISTS "Service role can manage accuracy stats" ON public.ai_accuracy_stats;
DROP POLICY IF EXISTS "Service role can manage cross sell impressions" ON public.cross_sell_impressions;
DROP POLICY IF EXISTS "Service role can manage invite codes" ON public.invite_codes;
DROP POLICY IF EXISTS "Service role can manage knowledge candidates" ON public.knowledge_candidates;
DROP POLICY IF EXISTS "Service role can manage knowledge entries" ON public.knowledge_entries;

COMMIT;