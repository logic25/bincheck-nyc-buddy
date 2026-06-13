
-- Tighten compliance_snapshots SELECT: only owners of linked dd_report, admins, or staff
DROP POLICY IF EXISTS authenticated_read_compliance_snapshots ON public.compliance_snapshots;

CREATE POLICY "Owners and admins can read compliance snapshots"
ON public.compliance_snapshots
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.dd_reports r
    WHERE r.id = compliance_snapshots.report_id
      AND r.user_id = auth.uid()
  )
);

-- Lock down audit_log inserts: remove client-side insertion entirely.
-- All audit writes go through the SECURITY DEFINER log_audit() function
-- (and audit triggers), so clients never need direct INSERT.
DROP POLICY IF EXISTS "Users can insert their own audit entries" ON public.audit_log;

REVOKE INSERT ON public.audit_log FROM authenticated, anon;

-- Make compliance_snapshot_latest a SECURITY INVOKER view so it
-- enforces the querying user's RLS instead of the view owner's.
ALTER VIEW public.compliance_snapshot_latest SET (security_invoker = true);
