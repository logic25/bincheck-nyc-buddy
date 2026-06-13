
## One consolidated plan

Grouped by what the user actually sees vs. what's under the hood. Disclaimer language below is yours, dropped in verbatim.

---

### A. Landing page (`src/pages/Index.tsx`)

1. **Remove the "How we compare" section entirely** (badge + H2 + comparison table).
2. **Pricing — 2 cards + a line, not 3 cards.**
   - Card 1: **One-Time Report — $199 / property** (+$75 rush toggle).
   - Card 2: **Professional — $599/mo · 5 reports** ($120/report effective).
   - Below cards, one line: *"Running more than 5 reports a month? [Contact us →](mailto:hello@binchecknyc.com)"* — kills the Enterprise card and the "10+ reports" claim.
   - Section subhead → *"Pay per property, or save with a firm plan."*
   - Trust strip collapsed to: *"Full refund if we can't complete your report."*
3. **"Flat $199 per property" CTA button — keep, retitle to `Order a Report — $199`.** It's the clearest action on the page. Used in the hero, the pricing card, and the footer CTA.
4. **FAQ — cut from 6 to 4, 1-2 sentence answers.**
   - What's in a report? · How fast? · How do payments work? · Can I see a sample?
5. **Footer disclaimer** → short version (see §D).

### B. Checkout (`src/pages/Order.tsx`)
- Replace the existing disclaimer block above the pay button with the **full BinCheck-adapted disclaimer** (your text, §D).
- Keep the SSL/TLS chip beside it.

### C. Auth — email signup must work (`src/pages/Auth.tsx`)
You said you can't sign up without Gmail. Email/password is supported by Cloud, so this is a UI gap, not a backend one.
- Audit `Auth.tsx`: confirm both `signInWithPassword` and `signUp({ email, password })` are wired with a visible Email tab.
- Add a "Sign up with email" flow with: email, password, confirm password, optional name.
- `emailRedirectTo: window.location.origin` on signUp.
- Add "Forgot password?" → `resetPasswordForEmail` → existing `/reset-password` page.
- Keep Google + Apple buttons above the email form, divider, then email form.
- Enable **leaked-password (HIBP) check** via `configure_auth`.

### D. Disclaimer — your DataTrace-adapted text, used in 3 places

**Long version (full text, verbatim):**
> **IMPORTANT NOTICE.** This report was compiled from public records made available by various NYC, state, and federal agencies (DOB, ECB/OATH, HPD, FDNY, DOF, DEP, ACRIS, and related sources). It is provided "AS IS," WITHOUT WARRANTY OF ANY KIND, express or implied, including without limitation any warranty of merchantability, fitness for a particular purpose, or accuracy, completeness, or timeliness. NYC public data is frequently incomplete or lagged; items may exist that are not yet posted, and posted items may be superseded. All information is current only as of the per-source dates stated in the Sources & As-Of section and is subject to continuation prior to any closing or filing decision.
>
> This report is provided for informational and preliminary due-diligence purposes only. It is NOT a title search, title report, title insurance, or an insured service, and it is NOT legal advice. It does not guarantee against, and assumes no liability for, any condition of title or compliance. BinCheckNYC, Inc. disclaims any and all liability to any person or entity arising from use of or reliance on this report. This report is prepared exclusively for the named recipient and not for the benefit of any third party. Verify all findings with the issuing agency and qualified counsel before acting.

**Short version (one-liner for marketing footer + section footers in the PDF):**
> *Compiled from public NYC, state, and federal records. Provided "as is" — not a title search, insured service, or legal advice. Subject to continuation prior to closing.*

**Placements:**
- Landing footer (`Index.tsx`) → short version.
- `/order` above pay button → long version.
- Terms §3 (`Terms.tsx`) → replace current "Independent verification" paragraph with long version. Entity = **BinCheckNYC, Inc.**
- PDF cover (`DDReportPrintView.tsx`) → long version. Add a new **"Sources & As-Of"** block on the cover listing each agency + the timestamp of its data pull (the long version references it). Section footers → short version.

### E. Regenerate flow (new — currently undefined)
What happens when a buyer wants a fresh pull on the same address (week later, day before closing, etc.):
- **Within 7 days of original delivery → free re-run** (single click "Refresh report" in dashboard; re-pulls all 8 agencies, re-generates PDF, marks new "as-of" timestamps). Cheap for us, huge trust signal.
- **After 7 days → $49 "continuation"** (same product, full re-pull, new PDF, new disclaimer dates). Mirrors the title-industry "continuation" line item your disclaimer already references.
- **Subscription tier → unlimited continuations included.**
- UI: button on every delivered report in `Dashboard.tsx` + `DDReportViewer.tsx`. New `dd_report_continuations` table to track parent_report_id, requested_at, charged_amount.
- *(Build pricing rules + UI now; Stripe charging for the $49 lights up when Stripe lands.)*

### F. Product hardening pass (for public launch)
Quick triage — what's needed before you flip on public signups:
1. **Auth coverage** — email + Google + Apple all functional (see §C).
2. **Rate limiting** on `/order` submit, lead capture, and report generation (already have `check_rate_limit` RPC — confirm it's wired on the three public endpoints).
3. **Input validation** — Zod schemas on every public Edge Function input (most have it; spot-check `search-property`, `submit_lead`, `track-cta-click`).
4. **404 / error boundary** — verify `NotFound.tsx` catches and `ErrorBoundary.tsx` wraps the app shell.
5. **Robots/sitemap/canonical** — verified present.
6. **Run `security--run_security_scan`** before publish; resolve any critical findings.
7. **Blank prod site (binchecknyc.com)** — root cause is the published build is stale relative to preview. Once these changes ship, re-publish; if the white page persists I'll open prod console and dig in.

---

## Files touched
- `src/pages/Index.tsx` — remove compare section, restructure pricing, retitle CTA, shrink FAQ, footer disclaimer.
- `src/pages/Order.tsx` — long disclaimer above pay button.
- `src/pages/Terms.tsx` — replace §3.
- `src/pages/Auth.tsx` — email signup + forgot-password flow.
- `src/pages/Dashboard.tsx`, `src/components/dd-reports/DDReportViewer.tsx` — "Refresh report" button.
- `src/components/dd-reports/DDReportPrintView.tsx` — long disclaimer on cover, Sources & As-Of block, short disclaimer in section footers.
- New table: `public.dd_report_continuations` (parent_report_id, requested_at, charged_amount, status) with RLS + GRANTs.
- `configure_auth` → `password_hibp_enabled: true`.

## Out of scope (intentionally deferred)
- Stripe checkout wiring (separate effort).
- Auto-generate-from-address sample pipeline.
- Redesigning the PDF beyond disclaimer + Sources block.

## One open question
Free re-run window — **7 days OK, or do you want 14?** (Title industry standard is "subject to continuation prior to closing" with no hard window; 7 days is buyer-friendly without inviting abuse.)
