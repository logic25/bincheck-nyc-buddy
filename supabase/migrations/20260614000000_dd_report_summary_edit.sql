-- Track admin/analyst edits to the AI-generated conclusion (property_status_summary)
-- so reviewers can correct or rewrite the summary before the report ships
-- without losing audit trail.

alter table public.dd_reports
  add column if not exists summary_edited_at timestamptz,
  add column if not exists summary_edited_by uuid references auth.users(id);

comment on column public.dd_reports.summary_edited_at is
  'Timestamp of the most recent human edit to property_status_summary. Null = AI-generated, untouched. Server-enforced via trigger.';
comment on column public.dd_reports.summary_edited_by is
  'auth.users.id of the user who last edited property_status_summary. Server-enforced via trigger — cannot be spoofed by client.';

-- ---------------------------------------------------------------------
-- Server-side audit trail enforcement.
-- Whenever property_status_summary actually changes on UPDATE, force
-- summary_edited_by = auth.uid() and summary_edited_at = now(). Client
-- cannot spoof these fields even with admin/analyst RLS access.
-- ---------------------------------------------------------------------
create or replace function public.enforce_dd_report_summary_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only stamp when the summary text actually changed. Null-safe comparison.
  if new.property_status_summary is distinct from old.property_status_summary then
    new.summary_edited_by := auth.uid();
    new.summary_edited_at := now();
  else
    -- Block client attempts to retroactively rewrite audit fields without
    -- actually changing the summary.
    new.summary_edited_by := old.summary_edited_by;
    new.summary_edited_at := old.summary_edited_at;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_dd_report_summary_audit on public.dd_reports;
create trigger enforce_dd_report_summary_audit
  before update on public.dd_reports
  for each row
  execute function public.enforce_dd_report_summary_audit();
