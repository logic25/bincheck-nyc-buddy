-- Coverage Exceed v2 (PR #5): agency-direct expansion
-- Adds 2 new jsonb columns to dd_reports for FDNY Vacate Orders + Bureau of Fire Prevention
-- archive. ACRIS deep links and tax-lien water-debt flag piggyback on existing acris_data
-- and tax_lien_data columns (additive, no schema change).

alter table public.dd_reports
  add column if not exists fdny_vacate_data jsonb default '{"active": [], "lifted": [], "total": 0}'::jsonb,
  add column if not exists fdny_bfp_data    jsonb default '{"items": [], "total": 0}'::jsonb;

comment on column public.dd_reports.fdny_vacate_data is
  'FDNY Building Vacate Orders (Open Data n5xc-7jfa). Shape: { active: [], lifted: [], total }.';
comment on column public.dd_reports.fdny_bfp_data is
  'FDNY Bureau of Fire Prevention - Active Violation Orders archive (Open Data bi53-yph3). Shape: { items: [], total }.';
