-- Allow users to view dd_reports where client_email matches their auth email
CREATE POLICY "Users can view reports by client_email"
ON public.dd_reports
FOR SELECT
TO authenticated
USING (auth.email() = client_email);