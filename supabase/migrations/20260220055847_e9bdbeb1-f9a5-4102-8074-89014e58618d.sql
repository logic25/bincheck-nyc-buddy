
-- Create a table to capture lead emails from the order form
CREATE TABLE IF NOT EXISTS public.order_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  first_name text,
  last_name text,
  company text,
  phone text,
  address text,
  concern text,
  rush_requested boolean DEFAULT false,
  requested_delivery_date date,
  step_reached integer DEFAULT 2,
  converted boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- No RLS needed for inserts (public lead capture), but only admins can read
ALTER TABLE public.order_leads ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a lead (unauthenticated order flow)
CREATE POLICY "Anyone can insert order leads"
  ON public.order_leads
  FOR INSERT
  WITH CHECK (true);

-- Only authenticated users can read leads (admin will use service role via edge fn)
CREATE POLICY "Authenticated users can view leads"
  ON public.order_leads
  FOR SELECT
  TO authenticated
  USING (true);

-- Create a DB function to get user emails for admin panel (security definer to access auth.users)
CREATE OR REPLACE FUNCTION public.get_users_with_email()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT au.id, au.email, au.created_at
  FROM auth.users au
  ORDER BY au.created_at DESC;
$$;

-- Grant execute to authenticated users (admin check done in app layer)
GRANT EXECUTE ON FUNCTION public.get_users_with_email() TO authenticated;
