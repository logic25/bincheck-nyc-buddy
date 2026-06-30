ALTER TABLE public.dd_reports
  ADD COLUMN IF NOT EXISTS resolution_source TEXT,
  ADD COLUMN IF NOT EXISTS resolution_confidence TEXT,
  ADD COLUMN IF NOT EXISTS resolution_warnings JSONB;