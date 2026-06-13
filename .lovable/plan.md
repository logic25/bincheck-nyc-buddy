# Build & Preview Health Report

No code changes were made. This is a read-only diagnostic.

## 1. Build / Dev server

Vite dev server is **clean**. Last several restarts came up in ~370 ms with no compile errors. Only noise in the logs:

- `Browserslist: caniuse-lite is 12 months old` — cosmetic, ignore.
- HMR updates from your recent edits to `Order.tsx`, `SubjectAndRequesterBlock.tsx`, `LeadCaptureDialog.tsx` all applied without failure.
- One `vite` page reload triggered by `src/integrations/supabase/types.ts` regen — expected.

No TypeScript compile errors surfaced at module load. (Reminder: I cannot run `tsc --noEmit` manually — the harness handles type-checking, and nothing failed it.)

## 2. Preview / runtime console

Loaded `/` in the preview. Console is clean except for known benign warnings:

- `X-Frame-Options may only be set via HTTP header` — from a `<meta>` tag in `index.html`. Cosmetic browser warning, not an error.
- Two React Router v6 → v7 future-flag deprecation warnings (`v7_relativeSplatPath`, `v7_startTransition`). Informational.

No runtime exceptions, no failed network requests, no red errors.

## 3. Smoke-test plan (requires build mode + a logged-in preview session)

I cannot execute these from plan mode because they require live navigation + form submission and, for flow #1 and #3, an authenticated user in the preview. Approving this plan will let me run them.

### Flow 1 — Generate DD report end-to-end
- Navigate `/dd-reports`, open **Generate DD Report** dialog.
- Fill address (e.g. `350 5th Ave, Manhattan`), prepared-for, scope = Entire Property.
- Submit; watch network for `dd_reports` insert + `generate-dd-report` edge function call.
- Pull `supabase--edge_function_logs` for `generate-dd-report` to confirm no 500s and snapshot writes succeed.
- Verify the report row reaches `status='ready'` (not `error`).

### Flow 2 — Order / lead-capture
- `/order`: complete step 1 (address + scope), step 2 (email/name) → confirm `check_rate_limit` RPC fires and `order_leads` insert returns 201.
- Trigger honeypot path by filling the hidden field via devtools → confirm silent drop.
- Trigger `LeadCaptureDialog` from a marketing page → confirm `submit_lead` RPC returns `{ok:true}`.

### Flow 3 — Admin/staff views over `dd_reports` & `compliance_snapshots`
- As admin: `/admin` (AdminReportManager) — list loads, opens a report, `compliance_snapshots` panel renders.
- As non-admin authenticated user: hit the same routes and confirm `compliance_snapshots` SELECT returns 0 rows (post fix from prior PR) without throwing.
- Check `AdminLeads`, `AdminAudit`, `AdminDocuments` — load without RLS errors in network tab.

### Reporting format I'll use
For each flow: ✅/❌, the network call(s) inspected, edge-function log excerpt if relevant, and any console errors.

## Bottom line so far
Static build + initial preview load: **no errors**. To validate the three flows live I need build-mode access and (for flows 1 & 3) confirmation that you're logged into the preview as an admin user.
