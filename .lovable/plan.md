

# Critical Fixes Plan — 9 Items

## 1. Fix broken HPD query in `search-property` (URGENT)

**Problem:** Line 89 treats BIN as BBL — `boroid=${bin.charAt(0)}` is wrong because BIN's first digit is not the borough code.

**Fix:** Refactor `lookupBINByAddress` to return both BIN and BBL from GeoSearch (`props.addendum.pad.bbl`). When searching by BIN directly (no address), do a GeoSearch or PLUTO lookup to resolve BBL. Then query HPD with correct `boroid`, `block`, `lot` parsed from BBL.

Changes:
- Rename function to `lookupByAddress` returning `{ bin, bbl }` 
- Add `lookupBBLByBIN` function using PLUTO: `${NYC_DATA_BASE}/64uk-42ks.json?bin=${bin}&$limit=1` to get BBL
- Parse BBL: `borough = bbl[0]`, `block = bbl.slice(1,6)` (strip leading zeros), `lot = bbl.slice(6,10)` (strip leading zeros)
- Fix HPD query to use parsed BBL values

## 2. Fix ECB status typo in `scoring.ts`

**Problem:** Line 50 checks `'resolve'` instead of `'resolved'`.

**Fix:** Change to `'resolved'`.

## 3. Add OATH agency violations to `search-property`

Add OATH hearings endpoint (`jz4z-kudi.json`) queried by BBL fields for agencies: FDNY, DEP, DOT, DSNY, LPC, DOF. Return as `oathViolations` array with fields: `ticket_number`, `issuing_agency`, `violation_date`, `charge_1_code_description`, `penalty_imposed`, `hearing_status`, `hearing_result`, computed `status`. Limit 100 per agency.

## 4. Add OATH to scoring engine + update types

**`src/types/property.ts`:**
- Add `OATHViolation` interface
- Add `oathViolations` to `PropertyData`
- Add `dobComplaints` to `PropertyData` (for item 5)

**`src/lib/scoring.ts`:**
- Add `calculateOATHScore` function (start 100, -5 per open, -min(20, penalty/2000))
- Adjust weights: HPD=0.35, DOB=0.30, ECB=0.20, OATH=0.15
- Add defensive `oathViolations: data.oathViolations || []` in `calculateComplianceScore`

**UI files using PropertyData** (Report.tsx, ReportSummary, ViolationsSection, ScoreCard): Will need to handle `oathViolations` gracefully — existing components already iterate `score.categories` dynamically so ScoreCard works automatically. ViolationsSection and ReportSummary need updates to show OATH data.

## 5. Add DOB Complaints to `search-property`

Add dataset `82gq-khvr` query by BIN, limit 200. Return as `dobComplaints` array with: `complaint_number`, `date_entered`, `status`, `complaint_category`, `unit`, `description`.

Add `DOBComplaint` interface to `property.ts`.

## 6. Add NYC App Token to all NYC Open Data API calls

**Approach:** Ask user to add `NYC_APP_TOKEN` as a backend secret. Update `fetchJSON` in `search-property` and `fetchNYCData` in `generate-dd-report` to append `$$app_token` query parameter if the env var exists. Graceful fallback if not set.

Note: This requires the user to register a free Socrata app token at [NYC Open Data](https://data.cityofnewyork.us/profile/edit/developer_settings). I'll prompt for this secret using the add_secret tool.

## 7. Fix email typo in Index.tsx

Two occurrences of `hello@bincheckyc.com` on lines 336 and 360 — change to `hello@binchecknyc.com`.

## 8. Add `.env` to `.gitignore`

Add `.env` line to `.gitignore`.

## 9. Add report generation retry logic

**Database:** Add `generation_started_at` column to `dd_reports` (timestamptz, nullable).

**`generate-dd-report`:** Set `generation_started_at = now()` when generation begins.

**`DDReportViewer.tsx`:** If `status === 'generating'` and `updated_at` is older than 5 minutes, show a "Retry Generation" button that re-invokes `generate-dd-report`.

**`DDReports.tsx`:** Same retry button logic on report cards in the list view.

---

## Implementation Order

1. Database migration: add `generation_started_at` column
2. Backend secret: prompt for `NYC_APP_TOKEN`
3. `search-property` edge function: fix HPD query, add OATH, add DOB Complaints, add app token
4. `generate-dd-report` edge function: set `generation_started_at`, add app token
5. `src/types/property.ts`: add `OATHViolation`, `DOBComplaint`, update `PropertyData`
6. `src/lib/scoring.ts`: fix ECB typo, add OATH scoring, rebalance weights
7. `src/pages/Index.tsx`: fix email typo
8. `.gitignore`: add `.env`
9. `src/components/dd-reports/DDReportViewer.tsx` + `src/pages/DDReports.tsx`: retry logic
10. `src/pages/Report.tsx`, `src/components/report/ViolationsSection.tsx`, `src/components/report/ReportSummary.tsx`: display OATH violations and DOB complaints in quick search results

---

## Files Summary

| File | Action |
|------|--------|
| DB migration | Add `generation_started_at` to `dd_reports` |
| `supabase/functions/search-property/index.ts` | Fix HPD, add OATH, add complaints, add app token |
| `supabase/functions/generate-dd-report/index.ts` | Set `generation_started_at`, add app token |
| `src/types/property.ts` | Add `OATHViolation`, `DOBComplaint`, update `PropertyData` |
| `src/lib/scoring.ts` | Fix `'resolve'` typo, add OATH scoring, rebalance weights |
| `src/pages/Index.tsx` | Fix email typo (2 occurrences) |
| `.gitignore` | Add `.env` |
| `src/components/dd-reports/DDReportViewer.tsx` | Add retry button for stale generating reports |
| `src/pages/DDReports.tsx` | Add retry button for stale generating reports |
| `src/pages/Report.tsx` | Handle new `oathViolations` / `dobComplaints` in quick search |
| `src/components/report/ViolationsSection.tsx` | Display OATH violations |
| `src/components/report/ReportSummary.tsx` | Include OATH in summary counts |

