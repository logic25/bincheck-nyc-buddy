## BinCheck Step 7 — Visual Polish (final plan)

Hero card composition is locked. I read `DDReportPrintView.tsx` directly — real report uses "Affects {Unit} (N)" + "Other Units / Floors (N)" groupings, navy section headers, dark-red affects-unit eyebrow, one-line factual note per item, status pill on the right. The hero will mirror that exactly with `SAMPLE` watermark.

### 1. GLE strip (everywhere except referral CTAs)

Remove from: `DDReportPrintView.tsx` (GLELetterhead, GLE_* constants, "Powered by GLE" footer), `Index.tsx`, `Order.tsx`, `AgencyLandingTemplate.tsx`, `NYCPropertyDueDiligence.tsx`, `HPDViolations.tsx`, `DOBViolationSearch.tsx`, `ECBViolationLookup.tsx`.

Carve-out — `ArchitectRequestDialog.tsx` + `CloseoutRequestDialog.tsx` reframed to:
> "Need this resolved? We recommend Green Light Expediting, a licensed NYC expediter we work with. Call 718-392-1969."

with `tel:7183921969` link.

### 2. Lead form trim — `LeadCaptureDialog.tsx`

Keep: **email, name, company, role**. Drop: property address field, message textarea. RPC keeps signature; removed fields pass `null`.

Role stays a dropdown with the current 6 options (attorney, investor, broker, title, developer, other).

### 3. Sample CTA — mailto only (no pipeline this PR)

On `intent="sample"` submit success, show:
> "Thanks — request a sample by emailing hello@binchecknyc.com with your address and we'll send one back within one business day."

No bucket, no template, no edge function. Real send pipeline deferred to follow-up.

### 4. Hero card — mirrors real report

`Index.tsx` hero right column becomes a print-view-styled card:

- Navy band header: `123 Sample Street · Unit 12B · BIN 0000000` (mono)
- `SAMPLE` diagonal watermark, low opacity
- Section: `DOB Violations – 3`
  - Eyebrow `AFFECTS UNIT 12B (2)` in #991b1b
  - 2 rows: agency pill · one-line factual note · status pill
  - Eyebrow `OTHER UNITS / FLOORS (1)` muted
  - 1 row
- 2px gray dividers between sections
- One more mini-section (e.g. `ECB Violations – 1`) so the grouping pattern reads at a glance

Drop the compliance-score block from the hero. Drop the BIN chips below the search (Index.tsx ~L213-214).

### 5. AI copy → analyst-reviewed

Sweep `Index.tsx`, `Order.tsx`, marketing pages, SEO meta. "AI-powered" → "analyst-reviewed" in hero, feature cards, comparison rows, pricing bullets. Keep "AI-drafted, analyst-reviewed" only in the trust ladder / how-it-works section. Zero model names.

### 6. No monitoring copy

Sweep marketing pages + SEO meta for "monitor", "ongoing", "alerts", "watch", "track changes", "continuous". Phase 0 stays silent.

### 7. "You don't pay" reframe

`Index.tsx` and `Order.tsx`: "If we can't deliver a complete report, you don't pay."

### 8. `/order` aesthetic refactor

Match landing page: dark navy header band, serif title with `#e63946` accent, numbered step chips, black-border plan cards (red top on active), confirmation card mirrors hero style. **No form logic, no pricing math, no Stripe.**

### 9. Sample section + dedicated block

Remove the standalone `#sample` block from `Index.tsx`. Replace with one inline CTA opening `LeadCaptureDialog intent="sample"`.

### 10. NULL `subject_unit` guard — `DDReportPrintView.tsx`

If `subject_unit` is NULL/empty, skip "Affects Unit {x}" / "Other Units" grouping entirely and render flat whole-building view. No empty `Unit ` label ever rendered.

---

### Files touched

`src/pages/Index.tsx`, `src/pages/Order.tsx`, `src/components/marketing/LeadCaptureDialog.tsx`, `src/components/dd-reports/DDReportPrintView.tsx`, `src/components/dd-reports/ArchitectRequestDialog.tsx`, `src/components/dd-reports/CloseoutRequestDialog.tsx`, `src/pages/marketing/AgencyLandingTemplate.tsx`, `src/pages/marketing/NYCPropertyDueDiligence.tsx`, `src/pages/marketing/HPDViolations.tsx`, `src/pages/marketing/DOBViolationSearch.tsx`, `src/pages/marketing/ECBViolationLookup.tsx`.

### Out of scope

Pricing math/tiers, Stripe wiring, sample-report send pipeline (bucket/template/edge function), `DDReportViewer` polish, Source Serif font swap, `gle-logo.png` deletion, DB migrations.
