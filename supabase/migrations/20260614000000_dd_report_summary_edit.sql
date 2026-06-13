-- Track admin edits to the AI-generated conclusion (property_status_summary)
-- so reviewers can correct or rewrite the summary before the report ships
-- without losing audit trail.

alter table public.dd_reports
  add column if not exists summary_edited_at timestamptz,
  add column if not exists summary_edited_by uuid references auth.users(id);

comment on column public.dd_reports.summary_edited_at is
  'Timestamp of the most recent human edit to property_status_summary. Null = AI-generated, untouched.';
comment on column public.dd_reports.summary_edited_by is
  'auth.users.id of the admin who last edited property_status_summary.';
