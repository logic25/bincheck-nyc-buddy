
CREATE TABLE public.cross_sell_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL,
  client_email text NOT NULL,
  cta_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  clicked_at timestamptz,
  converted_at timestamptz
);

ALTER TABLE public.cross_sell_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all cross sell impressions"
  ON public.cross_sell_impressions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage cross sell impressions"
  ON public.cross_sell_impressions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
