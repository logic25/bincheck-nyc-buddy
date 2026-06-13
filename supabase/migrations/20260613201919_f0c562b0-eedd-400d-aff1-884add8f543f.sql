drop policy if exists "authenticated_read_compliance_snapshots" on public.compliance_snapshots;

create policy "staff_read_compliance_snapshots"
  on public.compliance_snapshots
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));