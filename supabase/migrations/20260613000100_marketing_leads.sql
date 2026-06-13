-- =====================================================================
-- Marketing leads: capture funnel for visitors not ready to buy
-- =====================================================================
-- Goal: the 95% of landing-page visitors who won't drop $499 on first
-- visit can still leave their email + property in exchange for a free
-- 1-page sample report. We store the lead so sales can follow up.
--
-- Anonymous INSERT (no auth required) but rate-limited via
-- public.check_rate_limit() at the edge function or RPC layer in app
-- code. Admins read everything.
-- =====================================================================

CREATE TABLE public.marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  company text,
  role text,                     -- 'attorney' | 'investor' | 'broker' | 'title' | 'other'
  property_address text,         -- optional: address they want a sample on
  intent text,                   -- 'sample' | 'pricing' | 'enterprise' | 'general'
  message text,                  -- free-form note from the form
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  user_agent text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'rejected', 'spam')),
  notes text,                    -- analyst/sales follow-up notes
  contacted_at timestamptz,
  converted_at timestamptz,
  converted_to_report_id uuid REFERENCES public.dd_reports(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(email) > 3 AND email LIKE '%_@_%.__%')
);

CREATE INDEX idx_marketing_leads_status ON public.marketing_leads(status, created_at DESC);
CREATE INDEX idx_marketing_leads_email ON public.marketing_leads(lower(email));
CREATE INDEX idx_marketing_leads_recent ON public.marketing_leads(created_at DESC);

ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

-- Anonymous + authenticated visitors can INSERT (the public form).
-- They cannot read other leads. Rate limiting is enforced via the
-- submit_lead() RPC below.
CREATE POLICY "Anyone can submit a lead"
  ON public.marketing_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Staff (admin, sales, analyst) reads.
CREATE POLICY "Staff can view leads"
  ON public.marketing_leads FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Admin + sales can update (status, notes, contact bookkeeping).
CREATE POLICY "Admins and sales can update leads"
  ON public.marketing_leads FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales')
  );

-- updated_at trigger
CREATE TRIGGER update_marketing_leads_updated_at
  BEFORE UPDATE ON public.marketing_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- submit_lead RPC: rate-limited public entrypoint
-- ---------------------------------------------------------------------
-- Lets the marketing site call supabase.rpc('submit_lead', { ... })
-- without service-role keys. Applies a per-email rate limit (5 in 1 hr)
-- to prevent abuse, then inserts and returns the new id.

CREATE OR REPLACE FUNCTION public.submit_lead(
  _email text,
  _name text DEFAULT NULL,
  _company text DEFAULT NULL,
  _role text DEFAULT NULL,
  _property_address text DEFAULT NULL,
  _intent text DEFAULT 'sample',
  _message text DEFAULT NULL,
  _utm_source text DEFAULT NULL,
  _utm_medium text DEFAULT NULL,
  _utm_campaign text DEFAULT NULL,
  _referrer text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rate_check jsonb;
  new_id uuid;
  normalized_email text := lower(trim(_email));
BEGIN
  -- Basic validation (the table CHECK catches obvious garbage, this
  -- short-circuits to a friendlier error message).
  IF normalized_email IS NULL OR length(normalized_email) < 5 OR normalized_email NOT LIKE '%_@_%.__%' THEN
    RAISE EXCEPTION 'Invalid email address' USING ERRCODE = '22023';
  END IF;

  -- Rate limit per-email: 5 submissions per hour. Belt-and-suspenders
  -- on top of any edge-level rate limiting.
  rate_check := public.check_rate_limit('lead:' || normalized_email, 5, 60);
  IF NOT (rate_check->>'allowed')::boolean THEN
    RAISE EXCEPTION 'Too many submissions \u2014 try again later' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.marketing_leads (
    email, name, company, role, property_address, intent, message,
    utm_source, utm_medium, utm_campaign, referrer, user_agent
  ) VALUES (
    normalized_email, _name, _company, _role, _property_address,
    COALESCE(_intent, 'sample'), _message,
    _utm_source, _utm_medium, _utm_campaign, _referrer, _user_agent
  )
  RETURNING id INTO new_id;

  -- Best-effort audit entry (NULL actor since this is anon).
  PERFORM public.log_audit(
    'lead.submitted',
    'marketing_lead',
    new_id::text,
    jsonb_build_object('intent', COALESCE(_intent, 'sample'), 'has_address', _property_address IS NOT NULL)
  );

  RETURN jsonb_build_object('id', new_id, 'ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_lead(
  text, text, text, text, text, text, text, text, text, text, text, text
) TO anon, authenticated;
