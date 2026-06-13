-- =============================================================================
-- NYC Compliance Plant — Phase 0 substrate
-- =============================================================================
-- Every BinCheck report writes one versioned per-BIN snapshot here.
-- This is the seed of the shared NYC Compliance Plant. Today it sits in
-- BinCheck's Supabase project. In Phase 1, CitiSignal will read from it via
-- a shared store. In Phase 2, Beacon's resolution_playbooks will attach to it.
--
-- Design constraints:
--   - Idempotent (`if not exists`)
--   - Additive only — does not modify existing tables
--   - Non-fatal on write failure (caller wraps in try/catch)
--   - Per-source freshness + confidence metadata is mandatory
--   - data_hash enables cheap diffing across snapshots
-- =============================================================================

create table if not exists public.compliance_snapshots (
  id              uuid primary key default gen_random_uuid(),

  -- Geographic keys
  bin             text not null,
  bbl             text not null,
  address         text not null,
  borough         text,

  -- Point-in-time
  as_of           timestamptz not null default now(),

  -- Source provenance per data category. Shape:
  --   {
  --     "dob_violations":  {"source":"socrata|bis_live", "fetched_at":"...", "confidence":0.85, "count":12},
  --     "ecb_violations":  {"source":"socrata",          "fetched_at":"...", "confidence":0.90, "count":3},
  --     "bis_jobs":        {"source":"bis_live",         "fetched_at":"...", "confidence":0.99, "count":7},
  --     "dob_now_build":   {"source":"dobnow_live",      "fetched_at":"...", "confidence":0.99, "count":2},
  --     "dof_taxes":       {"source":"socrata|ptaps_live","fetched_at":"...","confidence":0.99},
  --     "dep_water":       {"source":"socrata|cis_live", "fetched_at":"...", "confidence":0.99},
  --     "hpd_violations":  {"source":"socrata",          "fetched_at":"...", "confidence":0.85, "count":0},
  --     "fdny_violations": {"source":"socrata",          "fetched_at":"...", "confidence":0.80, "count":1}
  --   }
  sources         jsonb not null default '{}'::jsonb,

  -- Canonical data envelope. Normalized across all sources, ready for diff/render.
  -- Shape:
  --   {
  --     "violations":         [...],
  --     "ecb":                [...],
  --     "hpd_violations":     [...],
  --     "fdny_violations":    [...],
  --     "permits_open":       [...],   // BIS jobs that are still open
  --     "permits_dob_now":    [...],   // DOB NOW Build records
  --     "tax_status":         {"balance": 1240.55, "delinquent": false, ...},
  --     "water_status":       {"balance": 0, ...},
  --     "active_orders":      ["partial_swo_20260201"],
  --     "landmarked":         false,
  --     "sidewalk_violations":[]
  --   }
  data            jsonb not null,

  -- SHA-256 hex of canonical-serialized `data` for cheap diffing.
  -- Two snapshots with identical data_hash have identical content;
  -- we can short-circuit diff comparison without re-serializing.
  data_hash       text not null,

  -- Back-pointer to the BinCheck report that produced this snapshot.
  -- Set null on report deletion so the snapshot survives as historical record.
  report_id       uuid references public.dd_reports(id) on delete set null,

  -- Subject context — what was the buyer/attorney scoped to?
  -- Pulled from dd_reports.subject_type / subject_unit / scope_of_work (added in PR #23).
  subject_type    text check (subject_type in ('unit', 'building') or subject_type is null),
  subject_unit    text,
  scope_of_work   text,

  -- Audit
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id)
);

-- Indexes for the access patterns we know we'll have
create index if not exists idx_compliance_snapshots_bin
  on public.compliance_snapshots(bin);
create index if not exists idx_compliance_snapshots_bbl
  on public.compliance_snapshots(bbl);
create index if not exists idx_compliance_snapshots_as_of
  on public.compliance_snapshots(as_of desc);
create index if not exists idx_compliance_snapshots_bin_as_of
  on public.compliance_snapshots(bin, as_of desc);
create index if not exists idx_compliance_snapshots_hash
  on public.compliance_snapshots(bin, data_hash);

-- Convenience view: latest snapshot per BIN. Used by date-down logic in Phase 1.
create or replace view public.compliance_snapshot_latest as
select distinct on (bin) *
from public.compliance_snapshots
order by bin, as_of desc;

-- RLS — restrict to authenticated; service role bypasses
alter table public.compliance_snapshots enable row level security;

create policy "service_role_full_access_compliance_snapshots"
  on public.compliance_snapshots
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "authenticated_read_compliance_snapshots"
  on public.compliance_snapshots
  for select
  using (auth.role() = 'authenticated');

comment on table public.compliance_snapshots is
  'Per-BIN versioned snapshot of NYC compliance state at a point in time. '
  'The seed of the NYC Compliance Plant (Phase 0). Written by BinCheck reports today; '
  'will be read by CitiSignal in Phase 1 for diff-based monitoring and by Beacon in Phase 2 '
  'for resolution playbook lookups. Designed to survive report deletion as historical record.';

comment on column public.compliance_snapshots.sources is
  'Per-source provenance: {category: {source, fetched_at, confidence, count|balance}}. '
  'Drives the "as-of" footnote on reports and the E&O liability story.';

comment on column public.compliance_snapshots.data_hash is
  'SHA-256 hex of canonical-serialized data field. Used for cheap diff short-circuit: '
  'if two snapshots have identical hash, no content change.';
