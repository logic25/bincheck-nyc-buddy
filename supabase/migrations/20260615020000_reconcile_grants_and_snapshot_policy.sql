-- Reconciliation record (idempotent). These two fixes were applied directly via the
-- SQL editor on 2026-06-13; captured here so the repo matches the live DB and a
-- rebuild-from-repo reproduces them. Safe to re-run.

-- 1. order_leads was missing table-level GRANTs entirely: the "Anyone can insert
--    order leads" RLS policy existed, but with no GRANT, PostgREST rejected inserts
--    with 42501 (RLS without GRANT = locked). This broke the /order lead-capture path.
grant insert on public.order_leads to anon;
grant select, insert, update on public.order_leads to authenticated;
grant all on public.order_leads to service_role;

-- 2. compliance_snapshots: the original migration shipped an open authenticated-read
--    policy (auth.role() = 'authenticated'), exposing every snapshot to any logged-in
--    user. Replace it with staff-only. service_role + owner/admin policies are unchanged.
drop policy if exists "authenticated_read_compliance_snapshots" on public.compliance_snapshots;
drop policy if exists "staff_read_compliance_snapshots" on public.compliance_snapshots;
create policy "staff_read_compliance_snapshots" on public.compliance_snapshots
  for select to authenticated using (public.is_staff(auth.uid()));
