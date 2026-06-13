-- Marketing-lead confirmation email trigger
-- ============================================================================
-- After a new marketing_leads row is inserted (via the submit_lead RPC or
-- a direct service-role insert), fire a request to the
-- `send-transactional-email` edge function which renders + enqueues the
-- `marketing-lead-confirmation` template.
--
-- We use net.http_post with the service_role key stored in vault under
-- 'email_queue_service_role_key' — the same secret the email-queue cron job
-- already relies on (see 20260403165914_email_infra.sql).
--
-- The trigger is best-effort: failures are caught and logged but never block
-- the underlying INSERT. The dispatcher will surface delivery failures in
-- email_send_log for ops triage.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_marketing_lead_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_service_role_key text;
  v_project_url      text;
  v_first_name       text;
  v_request_id       bigint;
BEGIN
  -- Resolve the service_role key + project URL from vault. Both are written
  -- once by the email-infra bootstrap. If they're missing we silently skip.
  BEGIN
    SELECT decrypted_secret INTO v_service_role_key
      FROM vault.decrypted_secrets
     WHERE name = 'email_queue_service_role_key'
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'lead-confirm: vault lookup failed: %', SQLERRM;
    RETURN NEW;
  END;

  BEGIN
    SELECT decrypted_secret INTO v_project_url
      FROM vault.decrypted_secrets
     WHERE name = 'project_url'
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_project_url := NULL;
  END;

  -- Fall back to the known project URL if vault entry is missing.
  IF v_project_url IS NULL OR v_project_url = '' THEN
    v_project_url := 'https://ohoutpkgkxfueyllgfvv.supabase.co';
  END IF;

  IF v_service_role_key IS NULL OR v_service_role_key = '' THEN
    RAISE NOTICE 'lead-confirm: missing service_role key in vault, skipping';
    RETURN NEW;
  END IF;

  -- Best-effort first-name extraction from the full-name field.
  v_first_name := NULLIF(split_part(COALESCE(NEW.name, ''), ' ', 1), '');

  -- Fire the HTTP request asynchronously via pg_net. We don't block on the
  -- response; the edge function handles suppression, dedupe, and queueing.
  BEGIN
    SELECT net.http_post(
      url     := v_project_url || '/functions/v1/send-transactional-email',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_role_key
      ),
      body    := jsonb_build_object(
        'templateName',   'marketing-lead-confirmation',
        'recipientEmail', NEW.email,
        'templateData',   jsonb_build_object(
          'firstName', v_first_name,
          'intent',    COALESCE(NEW.intent, 'general'),
          'company',   NEW.company
        )
      ),
      timeout_milliseconds := 5000
    ) INTO v_request_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'lead-confirm: net.http_post failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_marketing_lead_confirmation() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_marketing_lead_confirmation ON public.marketing_leads;
CREATE TRIGGER trg_marketing_lead_confirmation
  AFTER INSERT ON public.marketing_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_marketing_lead_confirmation();

COMMENT ON FUNCTION public.notify_marketing_lead_confirmation IS
  'After-insert trigger on marketing_leads: fires a best-effort POST to the send-transactional-email edge function so the lead gets a confirmation. Failures never block the insert.';

-- ============================================================================
-- Optional: store the canonical project URL in vault so the trigger doesn't
-- need a hard-coded fallback. Idempotent.
-- ============================================================================
DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'project_url'
  ) INTO v_exists;
  IF NOT v_exists THEN
    PERFORM vault.create_secret(
      'https://ohoutpkgkxfueyllgfvv.supabase.co',
      'project_url',
      'Supabase project URL used by DB triggers calling edge functions.'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'project_url vault upsert skipped: %', SQLERRM;
END$$;
