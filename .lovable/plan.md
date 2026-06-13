## What's already merged (from the GitHub push)

Perplexity shipped most of PRs #23–#25. Here's the actual state vs. the original plan:

| Plan item | Status on `main` | Notes |
|---|---|---|
| Migration: `subject_type` / `subject_unit` / `scope_of_work` / `requested_by_role` on `dd_reports` + `order_leads` | **Done** | `20260614010000_subject_and_requester_intake.sql` |
| `SubjectAndRequesterBlock` + wiring in `Order.tsx`, `CreateDDReportDialog`, `AdminLeads` | **Done** | All three call sites pass the 4 fields through |
| Per-item AI notes in `generate-dd-report` | **Done** | Generates `note` + `unit_relevance` + `impact_note` per item via tool-call schema |
| Admin per-item editing surface | **Done (different name)** | Lives in `InlineNoteEditor.tsx` + `AnalystApprovalPanel.tsx`, not a separate `LineItemReviewTab` |
| Report rendering: per-item notes + grouped-by-relevance + collapse | **Done** | `DDReportPrintView.tsx` groups by `unit_relevance === 'affects_unit' / 'other_unit'`, renders `impact_note` |
| Workflow lifecycle (`lead_pending` → … → `delivered`) | **Done** | `20260614030000_workflow_status.sql` + `email_log` table |
| `report_edits.unit_relevance` / `impact_note` override columns | **Done** | Same migration as above |
| AI learning loop for line-item edits | **Partial** | Edit columns exist on `report_edits`, but `get-learning-examples` doesn't yet inject them as few-shot |
| Landing copy broadened (attorneys + title cos + brokers + investors) | **Partial** | Marketing pages already mention all four audiences; `Index.tsx` still has attorney-leaning hero microcopy ("attorney-ready", "attorney notes") |
| Sample card copy (no advisory verbs) | **Not done** | Still needs the rewrite pass |

## Key shape divergence to acknowledge

My original plan proposed an **object keyed by `{source}:{external_id}`** with `impact: none|possible|direct`. What landed is:

- **Array** shape (back-compatible with the original `line_item_notes`).
- Field is **`unit_relevance`** with 5 values (`affects_unit | common_area | other_unit | whole_building | unknown`) — strictly factual, no "possible/direct" severity language. **This is the better choice given the no-advisory-verbs rule** — adopting it as the canonical shape.
- Separate `note` (full explanation) + `impact_note` (one-liner) instead of one combined field.

The render layer uses `unit_relevance` to group items into "Affects Unit 10B" vs "Other Units / Common Areas" buckets, which matches the 361 Clinton hand report better than my original "collapse if impact=none" idea.

**Verdict on the merged work: keep it as-is.** No re-migration, no shape rework.

## What remains (revised remaining-work plan)

### PR #26 — AI learning loop wiring (~45 min)
- Extend `get-learning-examples/index.ts` to surface approved `report_edits` rows where `unit_relevance` or `impact_note` were overridden, grouped by agency, as a new `relevance_examples` block in the response.
- Update `generate-dd-report/index.ts` per-item prompt to inject those examples alongside the existing few-shot.
- Bump `error_category` enum (if needed) with `wrong_unit_relevance` so the existing edit-review UI in `EditReviewTab.tsx` can classify these properly.

### PR #27 — copy rewrite (~30 min, presentation only)
- `src/pages/Index.tsx`:
  - Replace "attorney-ready PDF" / "attorney notes" / "attorney review" with audience-neutral phrasing ("transaction-ready PDF", "analyst notes", "pre-closing review") in the hero, feature cards, and FAQ.
  - "For law firms & title companies" subtitle on pricing → "For attorneys, title, brokers, and investors".
- Sample card on landing: drop any remaining advisory verbs (search for "recommend", "should", "advise" — replace with declarative "Note:" / "Impact:" framing per the core rule).
- Section microcopy on `DDReportPrintView` / `DDReportViewer` empty-state lines: confirm "No items affect Unit {X}" / "No items affect this building" wording matches the rendered subject.
- No component structure changes; pure string edits.

## Out of scope (unchanged)
- No scoring weight changes.
- No "AI Risk Assessment & Conclusion" narrative re-add.
- No payment/pricing changes.
- No re-shaping `line_item_notes` — the array+`unit_relevance` shape that landed is the canonical shape.

Two small PRs left. Want me to flip to build and start with #27 (copy, lower risk, visible immediately) or #26 (learning loop, higher leverage)?
