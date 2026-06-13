-- Step 6 migration: DOF PTAPS + DEP CIS live-fetch provenance columns
--
-- Adds four columns to dd_reports so the PrintView footnote can surface
-- which data source was used and when it was fetched:
--
--   dof_source     — 'socrata'    (default) | 'ptaps_live' | 'unavailable'
--   dep_source     — 'socrata'    (default) | 'cis_live'   | 'unavailable'
--   dof_fetched_at — NULL until DOF PTAPS live fetch runs
--   dep_fetched_at — NULL until DEP CIS live fetch runs
--
-- Also adds dep_charges_data JSONB to store the separate DEP CIS result
-- when USE_LIVE_DEP=true (DOF Charges Socrata still in dof_charges_data).
--
-- Feature flags in generate-dd-report:
--   USE_LIVE_DOF=true  → fetchDOFCharges calls fetchDOFLive → dof_source='ptaps_live'
--   USE_LIVE_DEP=true  → fetchDEPLive runs separately   → dep_source='cis_live'
--
-- Backward-compatible: existing rows keep dof_source='socrata', dep_source='socrata'.

alter table public.dd_reports
  add column if not exists dof_source text default 'socrata'
    check (dof_source in ('socrata', 'ptaps_live', 'unavailable')),
  add column if not exists dep_source text default 'socrata'
    check (dep_source in ('socrata', 'cis_live', 'unavailable')),
  add column if not exists dof_fetched_at timestamptz,
  add column if not exists dep_fetched_at timestamptz,
  add column if not exists dep_charges_data jsonb;

-- Comment the columns for schema-level documentation
comment on column public.dd_reports.dof_source     is 'Source of DOF property-tax data: socrata=Socrata scjx-j6np dataset, ptaps_live=DOF PTAPS portal (live), unavailable=live fetch failed';
comment on column public.dd_reports.dep_source     is 'Source of DEP water/sewer data: socrata=WAT/SEW rows in dof_charges_data, cis_live=DEP NYCePay CIS portal (live), unavailable=live fetch failed';
comment on column public.dd_reports.dof_fetched_at is 'Timestamp of the last live DOF PTAPS fetch. NULL when source=socrata.';
comment on column public.dd_reports.dep_fetched_at is 'Timestamp of the last live DEP CIS fetch. NULL when source=socrata.';
comment on column public.dd_reports.dep_charges_data is 'DEP CIS live water/sewer account data (only populated when dep_source=cis_live). Shape mirrors dof_charges_data WAT/SEW entries.';
