BEGIN;

-- rate_limit_buckets
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key text NOT NULL,
  window_start_minute timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, window_start_minute)
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_lookup
  ON public.rate_limit_buckets(key, window_start_minute DESC);
GRANT SELECT ON public.rate_limit_buckets TO authenticated;
GRANT ALL ON public.rate_limit_buckets TO service_role;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view rate limit buckets" ON public.rate_limit_buckets;
CREATE POLICY "Admins can view rate limit buckets"
  ON public.rate_limit_buckets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key text, _max_in_window integer, _window_minutes integer DEFAULT 60
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  current_bucket timestamptz := date_trunc('minute', now());
  window_start timestamptz := current_bucket - make_interval(mins => _window_minutes);
  total_count integer;
  oldest_bucket timestamptz;
BEGIN
  INSERT INTO public.rate_limit_buckets (key, window_start_minute, count)
  VALUES (_key, current_bucket, 1)
  ON CONFLICT (key, window_start_minute)
  DO UPDATE SET count = public.rate_limit_buckets.count + 1;
  SELECT COALESCE(SUM(count), 0), MIN(window_start_minute)
    INTO total_count, oldest_bucket
  FROM public.rate_limit_buckets
  WHERE key = _key AND window_start_minute > window_start;
  RETURN jsonb_build_object(
    'allowed', total_count <= _max_in_window,
    'count', total_count,
    'limit', _max_in_window,
    'window_minutes', _window_minutes,
    'retry_after_seconds',
      CASE WHEN total_count <= _max_in_window THEN 0
      ELSE GREATEST(0, EXTRACT(EPOCH FROM (oldest_bucket + make_interval(mins => _window_minutes) - now()))::int)
      END
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_buckets()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE deleted_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'permission denied: admin role required';
  END IF;
  DELETE FROM public.rate_limit_buckets WHERE window_start_minute < now() - interval '1 day';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END; $$;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_buckets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_buckets() TO authenticated;

-- audit_log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  CHECK (length(action) > 0)
);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log(actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON public.audit_log(target_type, target_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_recent ON public.audit_log(occurred_at DESC);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
GRANT ALL ON SEQUENCE public.audit_log_id_seq TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;
CREATE POLICY "Admins can view audit log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can insert their own audit entries" ON public.audit_log;
CREATE POLICY "Users can insert their own audit entries"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (op=%)', TG_OP;
END; $$;
DROP TRIGGER IF EXISTS audit_log_no_update ON public.audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();
DROP TRIGGER IF EXISTS audit_log_no_delete ON public.audit_log;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

CREATE OR REPLACE FUNCTION public.log_audit(
  _action text, _target_type text DEFAULT NULL,
  _target_id text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE new_id bigint; actor_email_snapshot text;
BEGIN
  SELECT email INTO actor_email_snapshot FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.audit_log (actor_id, actor_email, action, target_type, target_id, metadata)
  VALUES (auth.uid(), actor_email_snapshot, _action, _target_type, _target_id, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb) TO authenticated, service_role;

-- Audit triggers
CREATE OR REPLACE FUNCTION public.audit_user_roles_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('role.assigned', 'user_role', NEW.id::text,
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit('role.removed', 'user_role', OLD.id::text,
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role));
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_audit_user_roles_insert ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles_insert AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles_changes();
DROP TRIGGER IF EXISTS trg_audit_user_roles_delete ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles_delete AFTER DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles_changes();

CREATE OR REPLACE FUNCTION public.audit_dd_reports_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public.log_audit('report.deleted', 'dd_report', OLD.id::text,
    jsonb_build_object('address', OLD.address, 'bin', OLD.bin, 'bbl', OLD.bbl,
      'owner_user_id', OLD.user_id, 'prepared_for', OLD.prepared_for, 'status', OLD.status));
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS trg_audit_dd_reports_delete ON public.dd_reports;
CREATE TRIGGER trg_audit_dd_reports_delete AFTER DELETE ON public.dd_reports
  FOR EACH ROW EXECUTE FUNCTION public.audit_dd_reports_delete();

-- marketing_leads
CREATE TABLE IF NOT EXISTS public.marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  company text,
  role text,
  property_address text,
  intent text,
  message text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  user_agent text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','qualified','converted','rejected','spam')),
  notes text,
  contacted_at timestamptz,
  converted_at timestamptz,
  converted_to_report_id uuid REFERENCES public.dd_reports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(email) > 3 AND email LIKE '%_@_%.__%')
);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_status ON public.marketing_leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_email ON public.marketing_leads(lower(email));
CREATE INDEX IF NOT EXISTS idx_marketing_leads_recent ON public.marketing_leads(created_at DESC);
GRANT INSERT ON public.marketing_leads TO anon, authenticated;
GRANT SELECT, UPDATE ON public.marketing_leads TO authenticated;
GRANT ALL ON public.marketing_leads TO service_role;
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can submit a lead" ON public.marketing_leads;
CREATE POLICY "Anyone can submit a lead"
  ON public.marketing_leads FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can view marketing leads" ON public.marketing_leads;
CREATE POLICY "Admins can view marketing leads"
  ON public.marketing_leads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update marketing leads" ON public.marketing_leads;
CREATE POLICY "Admins can update marketing leads"
  ON public.marketing_leads FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS update_marketing_leads_updated_at ON public.marketing_leads;
CREATE TRIGGER update_marketing_leads_updated_at
  BEFORE UPDATE ON public.marketing_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.submit_lead(
  _email text, _name text DEFAULT NULL, _company text DEFAULT NULL,
  _role text DEFAULT NULL, _property_address text DEFAULT NULL,
  _intent text DEFAULT 'sample', _message text DEFAULT NULL,
  _utm_source text DEFAULT NULL, _utm_medium text DEFAULT NULL,
  _utm_campaign text DEFAULT NULL, _referrer text DEFAULT NULL,
  _user_agent text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE rate_check jsonb; new_id uuid; normalized_email text := lower(trim(_email));
BEGIN
  IF normalized_email IS NULL OR length(normalized_email) < 5 OR normalized_email NOT LIKE '%_@_%.__%' THEN
    RAISE EXCEPTION 'Invalid email address' USING ERRCODE = '22023';
  END IF;
  rate_check := public.check_rate_limit('lead:' || normalized_email, 5, 60);
  IF NOT (rate_check->>'allowed')::boolean THEN
    RAISE EXCEPTION 'Too many submissions — try again later' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.marketing_leads (
    email, name, company, role, property_address, intent, message,
    utm_source, utm_medium, utm_campaign, referrer, user_agent
  ) VALUES (
    normalized_email, _name, _company, _role, _property_address,
    COALESCE(_intent, 'sample'), _message,
    _utm_source, _utm_medium, _utm_campaign, _referrer, _user_agent
  ) RETURNING id INTO new_id;
  RETURN jsonb_build_object('id', new_id, 'ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_lead(text, text, text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;

COMMIT;