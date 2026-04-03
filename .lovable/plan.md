

# BinCheckNYC: Report-Ready Email, Cross-Sell Tracking, Lead Notifications & Admin Leads Tab

## Overview

This plan covers the full approved scope plus the enrichments for architect/closeout lead handling. There are 7 workstreams:

1. Email domain setup (prerequisite)
2. Email infrastructure + transactional email scaffolding
3. `cross_sell_impressions` table + `report-ready` email template
4. Client email capture in CreateDDReportDialog
5. Report approval triggers email send + cross-sell logging
6. CTA click tracking edge function
7. Lead notification emails (architect + closeout) + client confirmations
8. Admin "Service Requests" tab (unified view of architect + closeout requests with enhanced statuses)

---

## Step 1: Email Domain Setup

No email domain is configured. First step is showing the setup dialog so you can configure a sender domain (e.g., `notify.bincheckyc.com`). Nothing else can proceed until this is done.

## Step 2: Email Infrastructure

After domain is configured:
- Call `setup_email_infra` to create pgmq queues, email tables, cron job
- Call `scaffold_transactional_email` to create the `send-transactional-email` edge function, unsubscribe handling, and sample template
- Create unsubscribe page at the path specified by the scaffold output

## Step 3: Database Migration

Create `cross_sell_impressions` table:

```sql
CREATE TABLE public.cross_sell_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL,
  client_email text NOT NULL,
  cta_type text NOT NULL,  -- 'citisignal' or 'gle'
  sent_at timestamptz NOT NULL DEFAULT now(),
  clicked_at timestamptz,
  converted_at timestamptz
);
ALTER TABLE public.cross_sell_impressions ENABLE ROW LEVEL SECURITY;
-- Admin select, service_role full access
```

Also add `status` options to `architect_requests` and `closeout_requests` — they already have a `status` column with values like `submitted`, `assigned`, etc. We'll add UI support for: `submitted` → `contacted` → `converted` → `closed`.

## Step 4: Email Templates

Create 4 templates in `_shared/transactional-email-templates/`:

**a) `report-ready.tsx`** — Sent to client when report is approved
- Property address, report date, risk level summary
- "View Your Report" CTA button
- Conditional CitiSignal monitoring block (when `citisignal_recommended = true`)
- Conditional GLE block (when open applications exist)
- CTA links route through `track-cta-click` for impression tracking

**b) `gle-lead-notification.tsx`** — Sent to `info@greenlightexpediting.com`
- Request type (Architect Letter or Permit Closeout)
- Property address, client name/email/phone
- Selected violations or applications list
- Urgency level and quoted price
- "Reply to this email or call the client within 24hrs"

**c) `client-request-confirmation.tsx`** — Sent to client after submitting a request
- "Thank you for your request. Green Light Expediting will contact you within 24 hours regarding your [type] for [address]."

**d) Register all in `registry.ts`**

## Step 5: Trigger Wiring

**On report approval** (in `DDReportViewer.tsx`):
- After status update to `approved`, invoke `send-transactional-email` with `report-ready` template
- If `citisignal_recommended`, insert row into `cross_sell_impressions` with `cta_type: 'citisignal'`
- If open applications exist, insert with `cta_type: 'gle'`

**On architect/closeout request submission** (in `ArchitectRequestDialog.tsx` and `CloseoutRequestDialog.tsx`):
- After successful insert, invoke `send-transactional-email` twice:
  1. `gle-lead-notification` to `info@greenlightexpediting.com`
  2. `client-request-confirmation` to the client's contact email

## Step 6: Click Tracking Edge Function

Create `supabase/functions/track-cta-click/index.ts`:
- Accepts `id` (impression ID) and `dest` (destination URL) query params
- Updates `clicked_at` on the matching `cross_sell_impressions` row
- Returns 302 redirect to destination
- CTA links in report-ready email route through this function

## Step 7: Client Email Capture

Update `CreateDDReportDialog.tsx` to add an optional "Client Email" field that gets saved to `dd_reports.client_email`.

## Step 8: Admin Service Requests Tab

Replace the existing "Architect Letters" tab with a unified "Service Requests" tab in `AdminReportManager.tsx`:

- Combines `architect_requests` and `closeout_requests` into one view
- Sub-tabs or filter: All / Architect Letters / Permit Closeout
- Status workflow: New → Contacted → Converted → Closed (with color-coded badges)
- Each row shows: type, property address, client name/email/phone, urgency, price, time since submission
- Flag rows where status is still "submitted" and >48 hours old (red highlight or warning icon)
- Inline status update dropdown for admins
- This replaces the current `ArchitectLettersTab` component

## File Changes Summary

| File | Action |
|------|--------|
| Migration SQL | Create `cross_sell_impressions` |
| `src/components/dd-reports/CreateDDReportDialog.tsx` | Add client email field |
| `src/components/dd-reports/ArchitectRequestDialog.tsx` | Add email sends after submit |
| `src/components/dd-reports/CloseoutRequestDialog.tsx` | Add email sends after submit |
| `src/components/dd-reports/DDReportViewer.tsx` | Add email send + cross-sell logging on approval |
| `src/components/admin/ServiceRequestsTab.tsx` | New — unified leads/requests admin tab |
| `src/components/admin/AdminReportManager.tsx` | Replace ArchitectLettersTab with ServiceRequestsTab |
| `supabase/functions/track-cta-click/index.ts` | New — click tracking redirect |
| `supabase/functions/_shared/transactional-email-templates/report-ready.tsx` | New |
| `supabase/functions/_shared/transactional-email-templates/gle-lead-notification.tsx` | New |
| `supabase/functions/_shared/transactional-email-templates/client-request-confirmation.tsx` | New |
| `supabase/functions/_shared/transactional-email-templates/registry.ts` | Register templates |
| `supabase/config.toml` | Add track-cta-click config |
| Unsubscribe page (path TBD by scaffold) | New |

## Ordino Integration (Future — Not Built Now)

Noted for later: on architect/closeout request submission, call Ordino's `receive-lead` webhook to auto-create a lead/proposal with service type and pricing pre-filled. Requires Ordino webhook URL as a secret.

## First Action

Setting up the email domain. Let's start there.

