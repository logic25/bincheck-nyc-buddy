-- Subject + requester intake fields.
--
-- BinCheck reports are bought by attorneys, title companies, brokers, and
-- investors, and they're written against either a specific unit (purchase
-- of Unit 10B, future combination 10A+10B) or the whole building (refi
-- underwriting, title insurance). These columns carry that framing from the
-- order form all the way into the per-item AI prompt and the conclusion.
--
-- All columns nullable for back-compat with existing reports. subject_type
-- defaults to 'building' so legacy rows behave as they do today.

alter table public.dd_reports
  add column if not exists subject_type text not null default 'building'
    check (subject_type in ('unit', 'building')),
  add column if not exists subject_unit text,
  add column if not exists scope_of_work text,
  add column if not exists requested_by_role text;

alter table public.order_leads
  add column if not exists subject_type text default 'building'
    check (subject_type in ('unit', 'building')),
  add column if not exists subject_unit text,
  add column if not exists scope_of_work text,
  add column if not exists requested_by_role text;

comment on column public.dd_reports.subject_type is
  'Whether the report is scoped to a specific unit or to the whole building. Drives AI prompt framing and the "no items affect {subject}" copy.';
comment on column public.dd_reports.subject_unit is
  'Apartment / unit identifier (e.g. "10B"). Required at the application layer when subject_type = unit.';
comment on column public.dd_reports.scope_of_work is
  'Free-text transaction context (e.g. "future combination 10A+10B", "refi underwriting", "title insurance"). Frames the AI conclusion and per-item notes.';
comment on column public.dd_reports.requested_by_role is
  'Buyer type for analytics + light tone tweak: Attorney | Title Company | Broker | Investor | Owner | Other. Never gates features.';
