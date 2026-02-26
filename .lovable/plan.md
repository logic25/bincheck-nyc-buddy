

# Comprehensive Data Quality Fix

## Overview
10 changes across 3 files + 1 migration. Remove broken BIS scraper, add 3 missing datasets, implement deterministic rules engine for violation classification, fix print view, and deduplicate records.

---

## 1. Remove BIS Web Scraper (generate-dd-report)

Delete `fetchBISJobsFromWebsite` function (lines 295-381) and all references to it in `fetchApplications` (lines 414-430). DOB Jobs dataset `ic3t-wcy2` is the sole source.

## 2. Dual-Query DOB Jobs (generate-dd-report)

Replace the single query at line 388 with two parallel queries:
- Query A: `bin__=${bin}&$limit=500&$order=latest_action_date DESC`
- Query B: `bin__=${bin}&$limit=500&$order=pre__filing_date ASC`

Merge via `Promise.all`, deduplicate by `job__` keeping the record with more non-null fields. This captures 1990s filings that fell off the recent-activity window.

## 3. Add FDNY Violations Dataset (avgm-ztsb)

**Both edge functions.** Fire inspection violations (sprinkler, standpipe, fire alarm, egress) issued by Bureau of Fire Prevention -- separate from OATH hearings.

- Fetch by BIN with `$limit=200&$order=inspection_date DESC`
- Map to standard violation shape with `agency: "FDNY"`
- Deduplicate against OATH FDNY results by ticket/violation number

## 4. Add DOB Safety Violations (855j-jady)

**Both edge functions.** DOB NOW-era violations not in `3h2n-5cm9`.

- Fetch by BIN with `$limit=500`
- Deduplicate against existing DOB violations by `isn_dob_bis_viol` or `violation_number`

## 5. Add DOB Complaints Received (eabe-havv)

**Both edge functions + print view + DB migration.**

- Replace `82gq-khvr` with `eabe-havv` (includes 311 + DOB-entered complaints)
- Query by BIN, `$limit=200&$order=date_entered DESC`
- Store as `complaints_data` in dd_reports (new JSONB column via migration)
- Add "DOB Complaints" table section in DDReportPrintView between violations and applications

## 6. Increase HPD Violations Limit (generate-dd-report)

Change HPD `$limit` from `"200"` to `"1000"` at line 236. Large older buildings can have 500+ open HPD violations.

## 7. Add OATH + FDNY Violations to Print View (DDReportPrintView)

Currently only renders DOB, ECB, HPD groups. Add:
- FDNY violation group
- Other OATH agencies group (DEP, DOT, DSNY, LPC, DOF)
- Update Compliance Summary counts to include these agencies

## 8. Deterministic Rules Engine (generate-dd-report)

Add three functions: `parseConcern`, `classifyViolation`, `classifyApplication`.

- **parseConcern**: Extracts target unit/floor, purchase/refinance intent, and system keywords from customer concern text
- **classifyViolation**: Deterministic classification based on agency, status, severity class, penalty amount, and customer concern relevance. Key rules:
  - HPD Class C/B = always ACTION REQUIRED
  - ECB with penalty or default = ACTION REQUIRED
  - DOB stop work/vacate/unsafe = ACTION REQUIRED
  - FDNY sprinkler/standpipe/egress = ACTION REQUIRED
  - Closed/resolved = RESOLVED
  - Customer concern keyword match = elevate to ACTION REQUIRED
  - Purchase + target location = elevate
- **classifyApplication**: Time-based rules for DOB application lifecycle:
  - Approved but no activity 2+ years = ACTION REQUIRED (likely withdrawn)
  - Approved but no activity 1+ year = MONITOR (service notice territory)
  - Stale pre-filing 18+ months = MONITOR

Modify `generateLineItemNotes` to:
1. Run each item through the classifier, adding `pre_assigned_tag` field
2. Update the AI prompt to instruct: "Use the pre_assigned_tag exactly as-is. Your job is ONLY to write the note sentence."
3. Include DOB application lifecycle guidance and customer concern framing instructions

## 9. Violation Deduplication (generate-dd-report)

After `fetchViolations` returns, deduplicate by `agency + violation_number`. When duplicates exist (e.g., same FDNY violation in both avgm-ztsb and OATH), keep the record with more non-null fields.

## 10. Remove Dead Code (generate-dd-report)

Delete the `if (false) {}` block at lines 703-705.

---

## Database Migration

Add `complaints_data` JSONB column to `dd_reports`:

```sql
ALTER TABLE dd_reports ADD COLUMN IF NOT EXISTS complaints_data jsonb DEFAULT '[]'::jsonb;
```

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/generate-dd-report/index.ts` | Remove BIS scraper; dual-query DOB Jobs; add FDNY (avgm-ztsb), DOB Safety (855j-jady), DOB Complaints (eabe-havv); increase HPD limit; add parseConcern + classifyViolation + classifyApplication; update AI prompt for pre-assigned tags; add violation dedup; remove dead code; save complaints_data |
| `supabase/functions/search-property/index.ts` | Add FDNY Violations (avgm-ztsb); add DOB Safety Violations (855j-jady); replace complaints with eabe-havv |
| `src/components/dd-reports/DDReportPrintView.tsx` | Add FDNY + Other OATH violation groups; add DOB Complaints section; update compliance summary counts |
| `supabase/migrations/` | Add complaints_data column to dd_reports |

