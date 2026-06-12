-- Coverage Exceed v1 — DataTrace parity
-- Add seven JSONB columns to dd_reports to store the new data sources:
--   dof_charges_data    — DOF Property Charges (tax + DEP + sidewalk balances)
--   fuel_tank_data      — DEP Air Resources / DOB fuel-burning equipment
--   co_data             — DOB Certificates of Occupancy + BIS PDF links
--   sidewalk_data       — DOT Sidewalk Violations (Highway / Sidewalk Search)
--   hpd_erp_data        — HPD Emergency Repair (OMO + HWO) charges
--   fdny_direct_data    — FDNY direct violation pulls
--   external_links      — Deep links to source PDFs (CO, tax map, DOF account, ACRIS)
--
-- All columns are nullable JSONB with default '{}' so existing rows remain valid.

ALTER TABLE public.dd_reports
  ADD COLUMN IF NOT EXISTS dof_charges_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fuel_tank_data   jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS co_data          jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sidewalk_data    jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS hpd_erp_data     jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fdny_direct_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS external_links   jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.dd_reports.dof_charges_data IS
  'Coverage Exceed v1: DOF Property Charges aggregation (scjx-j6np). Mirrors DataTrace Tax Search / Account Balance.';
COMMENT ON COLUMN public.dd_reports.fuel_tank_data IS
  'Coverage Exceed v1: DOB Fuel-Burning Equipment (f4rp-2kvy). Mirrors DataTrace Air Resources Information Search.';
COMMENT ON COLUMN public.dd_reports.co_data IS
  'Coverage Exceed v1: DOB Certificates of Occupancy (bs8b-p36w) + BIS PDF deep links. Mirrors DataTrace CO with Open Permit Search.';
COMMENT ON COLUMN public.dd_reports.sidewalk_data IS
  'Coverage Exceed v1: DOT Sidewalk Violations (6kbp-uz6m). Mirrors DataTrace Highway / Sidewalk Violation Search.';
COMMENT ON COLUMN public.dd_reports.hpd_erp_data IS
  'Coverage Exceed v1: HPD Open Market Orders + Handyman Work Orders (mdbu-nrqn + sbnd-xujn). Mirrors DataTrace Emergency Repairs Violation Search.';
COMMENT ON COLUMN public.dd_reports.fdny_direct_data IS
  'Coverage Exceed v1: FDNY Violations direct pull (avgm-ztsb). Mirrors DataTrace Fire Department Violations.';
COMMENT ON COLUMN public.dd_reports.external_links IS
  'Coverage Exceed v1: Deep links to source PDFs and external portals (BIS CO lookup, NYC Property Information Portal, DOF account, ACRIS BBL search).';
