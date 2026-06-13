-- Per-item unit relevance + impact note.
-- Drives the GLE-style "no impact on Unit 10B" annotation on every violation and permit.
--
-- NOTE: BinCheck stores violations and permits as JSONB blobs (violations_data,
-- applications_data) on dd_reports, not as normalized rows. Per-item
-- unit_relevance and impact_note fields are therefore embedded inside
-- line_item_notes JSONB items (shape documented below) rather than as discrete
-- columns on a separate table.
--
-- Shape of each object in line_item_notes after this release:
-- {
--   "item_type": "violation" | "application",
--   "item_id": "<violation_number or app_id>",
--   "note": "<plain-English explanation, 1–3 sentences>",
--   "unit_relevance": "affects_unit" | "common_area" | "other_unit" | "whole_building" | "unknown",
--   "impact_note": "<one line, e.g. 'No impact on Unit 10B.' or 'Restricts future combination of 10A+10B.'>"
-- }
--
-- The GIN index below allows the analytics layer to filter or aggregate by
-- unit_relevance across all reports without scanning full JSONB blobs.

-- GIN index on line_item_notes for fast per-relevance-bucket queries.
create index if not exists idx_dd_reports_line_item_notes_gin
  on public.dd_reports using gin (line_item_notes);

-- Comment on line_item_notes to document the extended shape.
comment on column public.dd_reports.line_item_notes is
  'JSONB array of per-item AI notes. Each object: { item_type, item_id, note, unit_relevance, impact_note }. '
  'unit_relevance: affects_unit | common_area | other_unit | whole_building | unknown. '
  'impact_note: one-liner e.g. "No impact on Unit 10B." or "Restricts future combination of 10A+10B." '
  'Fields are nullable for back-compat with reports generated before this migration.';

-- Also extend report_edits to capture analyst overrides of unit_relevance and
-- impact_note separately from the note text itself.
alter table public.report_edits
  add column if not exists unit_relevance text
    check (unit_relevance in ('affects_unit', 'common_area', 'other_unit', 'whole_building', 'unknown')),
  add column if not exists impact_note text;

comment on column public.report_edits.unit_relevance is
  'Analyst-overridden relevance category for this item. Null = not overridden (AI value stands).';
comment on column public.report_edits.impact_note is
  'Analyst-overridden one-line impact statement. Null = not overridden (AI value stands).';
