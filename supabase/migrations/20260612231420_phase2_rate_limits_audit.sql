-- =====================================================================
-- Phase 2 hardening: rate limits + audit log
-- =====================================================================
-- Two tables that together protect BinCheck from abuse and create the
-- forensic trail every B2B product needs before its first lawsuit /
-- security review / SOC-2 attempt:
--
--   1. rate_limit_buckets - sliding-window rate limit storage. Edge
--      functions call public.check_rate_limit() before doing expensive
--      work (AI report generation, invite-code redemption, lead capture).
--
--   2. audit_log - append-only record of every privileged action: role
--      assignments, report deletions, document attachments, payment
--      status changes, etc. Read by admins only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. rate_limit_buckets - sliding window storage
-- ---------------------------------------------------------------------
-- Storage strategy: one row per (key, window_start_minute). Each call
-- increments the count for the current minute and looks back N minutes.
-- This is cheap, race-safe (uses ON CONFLICT DO UPDATE), and doesn't
-- need a cache layer. Rows older than 1 day are auto-deleted by a cron
-- (added in a later PR or run manually).

CREATE TABLE public.rate_limit_buckets (
  key text NOT NULL,                       -- e.g. 'gen_report:<user_id>' or 'invite_redeem:<ip>'
  window_start_minute timestamptz NOT NULL, -- minute-truncated bucket start
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, window_start_minute)
);

-- Lookups by key, recent buckets first. Partial index keeps it tiny.
CREATE INDEX idx_rate_limit_buckets_lookup
  ON public.rate_limit_buckets(key, window_start_minute DESC);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Only service-role (edge functions) writes; nobody else needs access.
-- Admins can SELECT for monitoring.
CREATE POLICY "Admins can view rate limit buckets"
  ON public.rate_limit_buckets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- 2. check_rate_limit RPC
-- ---------------------------------------------------------------------
-- Atomic: increments the current minute's count and returns whether the
-- caller is over the limit in the trailing window.
--
-- Inputs:
--   _key             - bucket identifier (e.g. 'gen_report:<user_id>')
--   _max_in_window   - max allowed in the window (e.g. 5)
--   _window_minutes  - lookback window in minutes (e.g. 60)
--
-- Returns: jsonb { allowed: bool, count: int, limit: int, retry_after: int }
--   retry_after is seconds until the oldest counted bucket expires.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key text,
  _max_in_window integer,
  _window_minutes integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_bucket timestamptz := date_trunc('minute', now());
  window_start timestamptz := current_bucket - make_interval(mins => _window_minutes);
  total_count integer;
  oldest_bucket timestamptz;
BEGIN
  -- Atomically increment the current minute's bucket.
  INSERT INTO public.rate_limit_buckets (key, window_start_minute, count)
  VALUES (_key, current_bucket, 1)
  ON CONFLICT (key, window_start_minute)
  DO UPDATE SET count = public.rate_limit_buckets.count + 1;

  -- Sum the trailing window.
  SELECT COALESCE(SUM(count), 0), MIN(window_start_minute)
  INTO total_count, oldest_bucket
  FROM public.rate_limit_buckets
  WHERE key = _key
    AND window_start_minute > window_start;

  RETURN jsonb_build_object(
    'allowed', total_count <= _max_in_window,
    'count', total_count,
    'limit', _max_in_window,
    'window_minutes', _window_minutes,
    'retry_after_seconds',
      CASE
        WHEN total_count <= _max_in_window THEN 0
        ELSE GREATEST(
          0,
          EXTRACT(EPOCH FROM (oldest_bucket + make_interval(mins => _window_minutes) - now()))::int
        )
      END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO authenticated, anon;

-- ---------------------------------------------------------------------
-- 3. Cleanup helper (called by a cron or manually)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_buckets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.rate_limit_buckets
  WHERE window_start_minute < now() - interval '1 day';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_buckets() TO authenticated;

-- ---------------------------------------------------------------------
-- 4. audit_log table
-- ---------------------------------------------------------------------
-- Append-only. Every privileged mutation should INSERT a row here.
-- Examples:
--   action='role.assigned'   target_type='user_role'    target_id=role_row_id
--   action='report.deleted'  target_type='dd_report'    target_id=report_id
--   action='doc.attached'    target_type='report_doc'   target_id=doc_id
--   action='payment.marked'  target_type='dd_report'    target_id=report_id

CREATE TABLE public.audit_log (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,         -- snapshot at time of action (in case user deleted)
  action text NOT NULL,     -- dotted scheme: <domain>.<verb>
  target_type text,         -- e.g. 'dd_report', 'user_role', 'report_doc'
  target_id text,           -- text so we can log non-uuid ids too
  ip_address text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,  -- before/after values, request context
  -- Prevent updates: this table is append-only. We enforce via RLS (no
  -- UPDATE/DELETE policies) and a trigger as defense-in-depth.
  CHECK (length(action) > 0)
);

CREATE INDEX idx_audit_log_actor ON public.audit_log(actor_id, occurred_at DESC);
CREATE INDEX idx_audit_log_action ON public.audit_log(action, occurred_at DESC);
CREATE INDEX idx_audit_log_target ON public.audit_log(target_type, target_id, occurred_at DESC);
CREATE INDEX idx_audit_log_recent ON public.audit_log(occurred_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read everything.
CREATE POLICY "Admins can view audit log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can INSERT but only their own actions (actor_id
-- must match auth.uid()). This lets client code log without service role
-- and prevents forging actor identity.
CREATE POLICY "Users can insert their own audit entries"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- Defense in depth: block UPDATE / DELETE at the trigger level so even
-- a future bad RLS policy can't undo audit history.
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (action=%, target=%)',
    TG_OP, COALESCE(OLD.target_type, '');
END;
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- ---------------------------------------------------------------------
-- 5. log_audit helper RPC
-- ---------------------------------------------------------------------
-- Lets edge functions and frontend code log audit entries without
-- juggling actor_id snapshots. The actor is always auth.uid() (or NULL
-- if service-role is calling).

CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _target_type text DEFAULT NULL,
  _target_id text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id bigint;
  actor_email_snapshot text;
BEGIN
  -- Best-effort email snapshot (no error if anonymous caller).
  SELECT email INTO actor_email_snapshot
  FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.audit_log (
    actor_id, actor_email, action, target_type, target_id, metadata
  ) VALUES (
    auth.uid(),
    actor_email_snapshot,
    _action,
    _target_type,
    _target_id,
    COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb) TO authenticated, anon;

-- ---------------------------------------------------------------------
-- 6. Auto-audit triggers for high-value tables
-- ---------------------------------------------------------------------
-- Role changes are sensitive enough to log automatically so we don't
-- depend on app code remembering.

CREATE OR REPLACE FUNCTION public.audit_user_roles_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit(
      'role.assigned',
      'user_role',
      NEW.id::text,
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit(
      'role.removed',
      'user_role',
      OLD.id::text,
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_user_roles_insert
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles_changes();

CREATE TRIGGER trg_audit_user_roles_delete
  AFTER DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles_changes();

-- Audit when dd_reports are deleted (catastrophic action).
CREATE OR REPLACE FUNCTION public.audit_dd_reports_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_audit(
    'report.deleted',
    'dd_report',
    OLD.id::text,
    jsonb_build_object(
      'address', OLD.address,
      'bin', OLD.bin,
      'bbl', OLD.bbl,
      'owner_user_id', OLD.user_id,
      'prepared_for', OLD.prepared_for,
      'status', OLD.status
    )
  );
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_audit_dd_reports_delete
  AFTER DELETE ON public.dd_reports
  FOR EACH ROW EXECUTE FUNCTION public.audit_dd_reports_delete();

-- Audit when documents are attached (analyst work product).
CREATE OR REPLACE FUNCTION public.audit_report_documents_attach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only log on status transition to 'attached' (avoid noise).
  IF NEW.status = 'attached' AND (OLD.status IS DISTINCT FROM 'attached') THEN
    PERFORM public.log_audit(
      'doc.attached',
      'report_doc',
      NEW.id::text,
      jsonb_build_object(
        'report_id', NEW.report_id,
        'agency', NEW.agency,
        'doc_type', NEW.doc_type,
        'file_size_bytes', NEW.file_size_bytes
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_report_documents_attach
  AFTER UPDATE ON public.report_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_report_documents_attach();
