-- =====================================================================
-- Report documents: manual analyst pull workflow
-- =====================================================================
-- Every NYC agency we cover (ACRIS, DOB BIS, ECB/OATH, DEP, FDNY) blocks
-- automated PDF retrieval. ACRIS's own bandwidth policy explicitly bans
-- "automated scripts/robots that are capturing data" and DOB BIS sits
-- behind Akamai (403 on any non-browser UA).
--
-- How Jack Jaffa / DataTrace get the actual branded PDFs at scale:
-- they have agency data-services agreements (paid subscriptions, or
-- registered-agent designations where NYC e-delivers violation copies
-- to them as agent-of-record). Both paths require business paperwork,
-- not code.
--
-- Until BinCheck has those agreements, this table is the bridge:
-- analyst manually fetches each high-value PDF through an interactive
-- browser session and attaches it to the report. Same schema will
-- accept bulk-feed inserts once an agreement is in place - we just flip
-- the seeding step from "deep link only" to "PDF bytes from feed".
--
-- This migration sets up the workflow management layer:
--   1. report_documents - one row per document an analyst needs to pull
--   2. Storage bucket 'report-documents' (private, signed-URL only)
--   3. RLS so clients see attached docs on their own reports, analysts
--      see all open tickets, admins do everything.
--
-- Tickets are auto-seeded when a report is generated (next PR wires the
-- seeding into the generate-dd-report edge function). The analyst queue
-- (/admin/documents) shows every ticket grouped by status; the analyst
-- clicks the source_url, downloads the PDF from the agency portal, and
-- uploads it back into our storage bucket - marking the ticket attached.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. report_documents table
-- ---------------------------------------------------------------------
CREATE TABLE public.report_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.dd_reports(id) ON DELETE CASCADE,

  -- Identification
  agency text NOT NULL,                -- 'ACRIS' | 'DOB' | 'ECB' | 'DEP' | 'FDNY' | etc.
  doc_type text NOT NULL,              -- 'deed' | 'mortgage' | 'lien' | 'violation' | 'co' | etc.
  doc_ref text,                        -- Agency identifier: ACRIS doc_id, DOB job#, ECB violation#
  title text,                          -- Display title for the queue and viewer

  -- Where the analyst goes to get the document
  source_url text,                     -- Deep link to agency portal (manual download)

  -- Workflow state
  -- pending           - just created, hasn't been worked yet
  -- needs_manual_pull - analyst should fetch this from the agency
  -- in_progress       - analyst has claimed it and is working
  -- attached          - PDF uploaded to storage, file_path set
  -- unavailable       - agency portal couldn't produce the doc (off-site / archived)
  -- not_applicable    - on second look this doc doesn't belong on this report
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'needs_manual_pull', 'in_progress', 'attached', 'unavailable', 'not_applicable')),

  -- Storage (set when status = 'attached')
  file_path text,                      -- Path inside 'report-documents' bucket
  file_size_bytes integer,
  mime_type text,                      -- usually 'application/pdf'

  -- Ownership / audit trail
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  fetched_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  fetched_at timestamptz,

  -- Analyst notes (e.g. "doc is sealed under court order", "wrong BBL")
  notes text,
  priority smallint NOT NULL DEFAULT 5,  -- 1 = highest, 9 = lowest

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the analyst queue page (filter by status, sort by priority+age)
CREATE INDEX idx_report_documents_status ON public.report_documents(status);
CREATE INDEX idx_report_documents_report_id ON public.report_documents(report_id);
CREATE INDEX idx_report_documents_queue ON public.report_documents(status, priority, created_at)
  WHERE status IN ('pending', 'needs_manual_pull', 'in_progress');
CREATE INDEX idx_report_documents_claimed_by ON public.report_documents(claimed_by)
  WHERE claimed_by IS NOT NULL;

-- Updated_at trigger (reuses the helper from migration 20260219075420)
CREATE TRIGGER update_report_documents_updated_at
  BEFORE UPDATE ON public.report_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2. RLS on report_documents
-- ---------------------------------------------------------------------
ALTER TABLE public.report_documents ENABLE ROW LEVEL SECURITY;

-- Client: read documents on their own reports (joins through dd_reports.user_id).
-- We use EXISTS so the user_id check is push-down friendly and doesn't leak
-- other clients' rows.
CREATE POLICY "Clients can view documents on their own reports"
  ON public.report_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dd_reports r
      WHERE r.id = report_documents.report_id
        AND r.user_id = auth.uid()
    )
  );

-- Staff (admin, analyst, sales): read everything.
CREATE POLICY "Staff can view all report documents"
  ON public.report_documents FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Admin + analyst: full CRUD (analyst is the daily workhorse here).
CREATE POLICY "Admin and analyst can insert report documents"
  ON public.report_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'analyst')
  );

CREATE POLICY "Admin and analyst can update report documents"
  ON public.report_documents FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'analyst')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'analyst')
  );

CREATE POLICY "Admin can delete report documents"
  ON public.report_documents FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- 3. Storage bucket - private, signed URLs only
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-documents', 'report-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: <report_id>/<doc_id>.pdf
-- We don't bake the path into the RLS (Postgres can't cheaply parse it);
-- instead we check via the report_documents table for SELECT, and gate
-- writes to staff roles.

-- Staff can upload (write into the bucket).
CREATE POLICY "Staff can upload report documents to storage"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'report-documents'
    AND public.is_staff(auth.uid())
  );

-- Staff can update objects (for re-uploads / overwrites).
CREATE POLICY "Staff can update report document storage objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'report-documents'
    AND public.is_staff(auth.uid())
  );

-- Staff can delete objects (mostly admin doing cleanup).
CREATE POLICY "Admins can delete report document storage objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'report-documents'
    AND public.has_role(auth.uid(), 'admin')
  );

-- SELECT on storage.objects: staff sees everything; clients see only the
-- objects attached to their own reports via the report_documents join.
CREATE POLICY "Staff can read report document storage objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'report-documents'
    AND public.is_staff(auth.uid())
  );

CREATE POLICY "Clients can read storage objects on their own reports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'report-documents'
    AND EXISTS (
      SELECT 1
      FROM public.report_documents d
      JOIN public.dd_reports r ON r.id = d.report_id
      WHERE d.file_path = storage.objects.name
        AND r.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 4. Helper: bulk-seed tickets for a report
-- ---------------------------------------------------------------------
-- Used by the generate-dd-report edge function (next PR will wire it in)
-- and by the "Reseed queue" admin button on individual reports.
--
-- Inputs are passed as a JSONB array so we can build the entire queue in
-- one call from the edge function once ACRIS / DOB / ECB data is in hand.
--
-- Example payload:
--   [
--     {"agency": "ACRIS", "doc_type": "deed", "doc_ref": "2024010100123001001",
--      "title": "Deed 1/1/2024", "source_url": "https://..."},
--     ...
--   ]
CREATE OR REPLACE FUNCTION public.seed_report_documents(
  _report_id uuid,
  _docs jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
  doc jsonb;
BEGIN
  -- Caller must be staff OR the report owner (so the user-facing
  -- "Generate report" path can call this from the edge function with
  -- the user's JWT). Service role bypasses RLS anyway.
  IF NOT (
    public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.dd_reports r
      WHERE r.id = _report_id AND r.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to seed documents for this report';
  END IF;

  FOR doc IN SELECT * FROM jsonb_array_elements(_docs)
  LOOP
    INSERT INTO public.report_documents (
      report_id, agency, doc_type, doc_ref, title, source_url, status, priority
    ) VALUES (
      _report_id,
      COALESCE(doc->>'agency', 'UNKNOWN'),
      COALESCE(doc->>'doc_type', 'document'),
      doc->>'doc_ref',
      doc->>'title',
      doc->>'source_url',
      'needs_manual_pull',
      COALESCE((doc->>'priority')::smallint, 5)
    )
    -- Don't double-seed the same (report, agency, doc_ref) on re-runs.
    ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END LOOP;

  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_report_documents(uuid, jsonb) TO authenticated;

-- Conflict target for the ON CONFLICT above
CREATE UNIQUE INDEX idx_report_documents_unique_ref
  ON public.report_documents(report_id, agency, doc_ref)
  WHERE doc_ref IS NOT NULL;
