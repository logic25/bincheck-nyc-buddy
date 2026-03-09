
CREATE TABLE public.closeout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.dd_reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  property_address text NOT NULL,
  application_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_description text,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  urgency text NOT NULL DEFAULT 'standard',
  price_quoted numeric NOT NULL DEFAULT 500,
  status text NOT NULL DEFAULT 'submitted',
  assigned_expediter text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.closeout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own closeout requests"
  ON public.closeout_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own closeout requests"
  ON public.closeout_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all closeout requests"
  ON public.closeout_requests FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all closeout requests"
  ON public.closeout_requests FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));
