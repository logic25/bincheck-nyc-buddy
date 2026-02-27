
-- Create architect_requests table
CREATE TABLE public.architect_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.dd_reports(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  property_address text NOT NULL,
  violation_numbers jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_description text,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  urgency text NOT NULL DEFAULT 'standard' CHECK (urgency IN ('standard', 'rush')),
  price_quoted numeric NOT NULL DEFAULT 750,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'assigned', 'site_visit_scheduled', 'draft_ready', 'delivered')),
  assigned_architect text,
  letter_file_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.architect_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view own architect requests"
  ON public.architect_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own requests
CREATE POLICY "Users can insert own architect requests"
  ON public.architect_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all requests
CREATE POLICY "Admins can view all architect requests"
  ON public.architect_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update all requests
CREATE POLICY "Admins can update all architect requests"
  ON public.architect_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
CREATE TRIGGER set_updated_at_architect_requests
  BEFORE UPDATE ON public.architect_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
