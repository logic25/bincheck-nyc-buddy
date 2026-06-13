-- =====================================================================
-- Manual workflow status columns + email log extension
-- =====================================================================
-- Step 5: Wires admin-approve → data-fetch → analyst-review → email-PDF
-- lifecycle for the manual (invoice-on-paper) order path.
--
-- Adds:
--   1. dd_report_status enum  (lifecycle states for a report)
--   2. dd_reports workflow columns (workflow_status, approved_by,
--      approved_at, sent_to_email, sent_at)
--   3. order_leads workflow columns (status, approved_by, approved_at,
--      report_id, rejection_reason)
--   4. Staff RLS on order_leads (admin can update; analyst can read)
--   5. email_log table (lightweight, service-role-only audit of
--      report delivery emails — distinct from the full email_send_log
--      queue table which lives in the email infrastructure)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. dd_report_status enum
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dd_report_status') THEN
    CREATE TYPE public.dd_report_status AS ENUM (
      'lead_pending',
      'lead_approved',
      'data_fetching',
      'data_ready',
      'analyst_review',
      'analyst_approved',
      'sent',
      'delivered'
    );
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- 2. dd_reports workflow columns
-- ---------------------------------------------------------------------
ALTER TABLE public.dd_reports
  ADD COLUMN IF NOT EXISTS workflow_status public.dd_report_status NOT NULL DEFAULT 'data_ready',
  ADD COLUMN IF NOT EXISTS approved_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_email    text,
  ADD COLUMN IF NOT EXISTS sent_at          timestamptz;

COMMENT ON COLUMN public.dd_reports.workflow_status IS
  'Manual workflow lifecycle: lead_pending → lead_approved → data_fetching → data_ready → analyst_review → analyst_approved → sent → delivered';
COMMENT ON COLUMN public.dd_reports.approved_by IS
  'Analyst or admin who gave final approval before sending the PDF.';
COMMENT ON COLUMN public.dd_reports.approved_at IS
  'Timestamp when analyst_approved state was reached.';
COMMENT ON COLUMN public.dd_reports.sent_to_email IS
  'Email address the PDF delivery was sent to (may differ from client_email if override used).';
COMMENT ON COLUMN public.dd_reports.sent_at IS
  'Timestamp when the delivery email was dispatched via Resend.';

-- Index for the analyst queue (list all reports in analyst_review / data_ready)
CREATE INDEX IF NOT EXISTS idx_dd_reports_workflow_status
  ON public.dd_reports(workflow_status);

-- ---------------------------------------------------------------------
-- 3. order_leads workflow columns
-- ---------------------------------------------------------------------
-- Base table (20260220055847) only has converted (bool).
-- Add proper status + approval audit trail + report linkage.
ALTER TABLE public.order_leads
  ADD COLUMN IF NOT EXISTS status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'converted')),
  ADD COLUMN IF NOT EXISTS approved_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS report_id        uuid REFERENCES public.dd_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

COMMENT ON COLUMN public.order_leads.status IS
  'Admin-managed state: pending → approved (report created) | rejected.';
COMMENT ON COLUMN public.order_leads.approved_by IS
  'Admin user who approved/rejected the lead.';
COMMENT ON COLUMN public.order_leads.approved_at IS
  'Timestamp when the lead was approved or rejected.';
COMMENT ON COLUMN public.order_leads.report_id IS
  'dd_reports row spawned when this lead was approved.';
COMMENT ON COLUMN public.order_leads.rejection_reason IS
  'Optional plain-text reason shown to requester when rejected.';

CREATE INDEX IF NOT EXISTS idx_order_leads_status
  ON public.order_leads(status, created_at DESC);

-- ---------------------------------------------------------------------
-- 4. RLS: analysts can read order_leads (for context during review)
-- ---------------------------------------------------------------------
CREATE POLICY "Analysts can view order leads"
  ON public.order_leads FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'analyst'));

-- Admin can update (already exists from 20260220065240) but we need to
-- cover the new workflow columns — existing policy covers the whole row so
-- no new policy is required; just documenting that coverage here.

-- ---------------------------------------------------------------------
-- 5. email_log table
-- ---------------------------------------------------------------------
-- Lightweight audit trail for report-delivery emails only (separate from
-- the full queue-based email_send_log which handles auth + transactional).
-- Seeded by the send-report-email edge function after each Resend call.
CREATE TABLE IF NOT EXISTS public.email_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid NOT NULL REFERENCES public.dd_reports(id) ON DELETE CASCADE,
  recipient     text NOT NULL,
  subject       text,
  resend_id     text,              -- Resend message ID returned on success
  status        text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed', 'bounced')),
  error         text,              -- Error message if status = failed
  sent_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb
);

CREATE INDEX IF NOT EXISTS idx_email_log_report_id
  ON public.email_log(report_id);
CREATE INDEX IF NOT EXISTS idx_email_log_sent_at
  ON public.email_log(sent_at DESC);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

-- Service role (edge functions) can do everything.
CREATE POLICY "Service role has full access to email_log"
  ON public.email_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Staff can read (for audit / resend history on a report).
CREATE POLICY "Staff can view email_log"
  ON public.email_log FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));
