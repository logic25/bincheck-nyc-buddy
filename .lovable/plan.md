# Bug fix plan — execute in order

Four open bugs, sequenced by impact ÷ effort. Each step is independently shippable so you can review between fixes.

---

## Step 1 — Create-report dialog can't scroll (5 min)

**File:** `src/components/dd-reports/CreateDDReportDialog.tsx`

Add `max-h-[85vh] overflow-y-auto` to the `DialogContent` so the form scrolls on small viewports and the footer stays reachable. No logic changes.

---

## Step 2 — "Couldn't generate a DD report" errors (investigate → fix)

20 reports sit in `status='error'`. Today's two failures for "186 kent street, brooklyn" errored within 0.5s with `generation_started_at = null` and **no edge-function HTTP logs at all**, meaning the client `supabase.functions.invoke('generate-dd-report', …)` call is failing before the function runs.

**Investigation (live, before coding):**
1. Pull recent `function_edge_logs` + `edge_function_logs` for `generate-dd-report` to confirm whether boot is failing or invocation never lands.
2. Re-invoke `generate-dd-report` via `supabase--curl_edge_functions` with the same address payload to capture the actual HTTP response/body.
3. Check secrets used by the function (`NYC_APP_TOKEN`, `BIS_SCRAPER_URL`, `BIS_SCRAPER_SECRET`, `LOVABLE_API_KEY`) against `index.ts` — missing secret = instant boot failure.
4. Check for a schema-drift mismatch between `dd_reports` columns the function writes and what's currently in the DB.

**Fix:** depends on root cause. Most likely one of: (a) missing/renamed secret → request via `add_secret`; (b) `dd_reports` insert failing on a NOT NULL column added later → patch the function; (c) function boot exception in a recently-edited file → patch and redeploy. After the fix, re-run one failed report end-to-end and confirm `status='ready'`.

---

## Step 3 — 228 Greene Applications tab: missing BIS jobs (scraper work)

Two sub-issues for BIN 3056254:

**3a. Missing Build jobs.** `bis-scraper-proxy` currently only returns the Jobs dataset but BIS Build entries for this BIN aren't appearing. Verify by hitting the Railway scraper directly with the BIN, compare against the BIS site, and either (i) fix the parser/selector in the Railway scraper if rows are dropped, or (ii) extend `generate-dd-report`'s `fetchBISLive()` if results are returned but not persisted.

**3b. Electrical applications never fetched.** Extend the Railway scraper to call BIS `BECApplicationsByAddressServlet`, normalize rows with `source='BIS_ELEC'`, and merge into `applications` so they render in the Applications tab. UI already renders any row in `applications` — no frontend change needed beyond a source label.

Ship 3a first (small), then 3b.

---

## Step 4 — Closeout & Architect request emails (biggest scope)

`CloseoutRequestDialog` and `ArchitectRequestDialog` are phone-only stubs — no DB insert, no email. Convert both to real submission flows.

**Assumed defaults (flag now if you disagree):**
- **Quote-after-review** model: customer gets a "we got your request, expediter will reply within 1 business day" confirmation; analyst sets `price_quoted` in admin and a separate "quote ready" email fires on status → `contacted`.
- **Also notify GLE** (`chris@greenlightexpediting.com`) on every new request.
- **Mirror the fix to ArchitectRequestDialog** — same gap.

**Work:**
1. Dialog forms: contact name, email, phone, optional notes + the pre-tagged applications/violations as a read-only checklist. Submit button.
2. On submit → `INSERT` into `closeout_requests` / `architect_requests` with `status='submitted'`, `report_id`, `property_address`, tagged items.
3. Create 4 React Email templates in `supabase/functions/_shared/transactional-email-templates/`:
   - `closeout-request-received` (customer)
   - `closeout-quote-ready` (customer, fires on status→contacted)
   - `architect-request-received` (customer)
   - `architect-quote-ready` (customer)
   - Plus internal notifications to GLE (reuse `to:` template-level recipient pattern already used by `gle-lead-notification`).
4. Register all templates in `registry.ts`, deploy `send-transactional-email`.
5. Admin wiring: in the existing `ServiceRequestsTab` / `ArchitectLettersTab`, when an analyst sets `price_quoted` and moves status to `contacted`, fire the "quote ready" email. (One `supabase.functions.invoke` call, no new edge function.)
6. Keep the "or call 718-392-1969" line as secondary CTA in each dialog.

---

## Technical notes

- All edits are file changes + email template scaffolding. No new tables — `closeout_requests` and `architect_requests` already exist with the needed columns.
- No RLS changes needed if existing policies already allow authenticated users to insert their own rows (will verify before coding step 4).
- Deploy targets per step: Step 1 none; Step 2 likely `generate-dd-report`; Step 3 Railway scraper redeploy + maybe `bis-scraper-proxy`; Step 4 `send-transactional-email` + admin UI.

I'll pause after each step for you to verify before moving on.
