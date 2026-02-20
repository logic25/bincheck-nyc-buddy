
# Adding DSNY + All Missing Agency Violations (FDNY, DEP, DOT, LPC, DOF)

## What We Found in CitiSignal

The [CitiSignal](/projects/9d9b6494-36da-4c50-a4c2-79428913d706) project already solved this exact problem. The key insight: **DSNY, FDNY, DEP, DOT, LPC, and DOF do not have their own reliable per-property Open Data datasets.** Instead, all of their violations that went to a hearing are recorded in a single dataset:

- **OATH Hearings Dataset**: `https://data.cityofnewyork.us/resource/jz4z-kudi.json`

This is queried by **BBL components** (borough, block, lot) and filtered by `issuing_agency` name. This is the battle-tested approach from CitiSignal that correctly returns violations for all of these agencies.

The agency name mappings used in OATH:

| Code | OATH Agency Name |
|---|---|
| FDNY | `FIRE DEPARTMENT OF NYC` |
| DEP | `DEPT OF ENVIRONMENT PROT` |
| DOT | `DEPT OF TRANSPORTATION` |
| DSNY | `DEPT OF SANITATION` |
| LPC | `LANDMARKS PRESERV COMM` |
| DOF | `DEPT OF FINANCE` |

---

## What's Being Fixed

### 1. Edge Function — Add OATH Violation Fetching

In `supabase/functions/generate-dd-report/index.ts`, add a new `fetchOATHViolations` function that:
- Takes `bbl` (already available), `agency` code, and the OATH agency name
- Queries the OATH Hearings dataset by `issuing_agency`, `violation_location_borough`, `violation_location_block_no`, `violation_location_lot_no`
- Returns normalized violations in the same shape already used (id, agency, violation_number, description_raw, issued_date, status, penalty_amount, etc.)
- Determines `status: 'open' | 'closed'` by checking OATH fields `hearing_status`, `hearing_result`, `compliance_status` against resolved terms (paid, written off, dismissed, etc.)

Add a new `NYC_ENDPOINTS.OATH_HEARINGS` constant:
```
https://data.cityofnewyork.us/resource/jz4z-kudi.json
```

Call this for all 6 agencies in parallel using `Promise.all()` inside `fetchViolations()`.

The OATH record fields we use:
- `ticket_number` → `violation_number`
- `violation_date` → `issued_date`
- `hearing_date` → hearing info
- `charge_1_code_description` + `charge_2_code_description` → `description_raw`
- `penalty_imposed` / `total_violation_amount` → `penalty_amount`
- `respondent_last_name` + `respondent_first_name` → `respondent_name`
- `hearing_status` + `hearing_result` + `compliance_status` → determines `status`

### 2. Edge Function — Fix Applicant Label (Architect not GC)

In `fetchApplications()`, rename the `applicant_name` field for BIS jobs to clarify it is the **filing professional (architect/PE)**, not the general contractor. This is a data mapping label issue, not a data source issue. The field `applicant_s_first_name`/`applicant_s_last_name` in the BIS dataset is always the design professional of record.

Change field name from `applicant_name` to `filing_professional_name` in the returned object for BIS jobs.

### 3. Edge Function — Fix DOB NOW External Link Logic

In `ExpandableApplicationRow.tsx`, the "View on DOB BIS" button always opens a BIS URL even for DOB NOW jobs. Fix:
- BIS jobs (`source === 'BIS'`): keep `https://a810-bisweb.nyc.gov/bisweb/JobsQueryByNumberServlet?passjobnumber=<number>` — this deep-links directly to the job
- DOB NOW jobs (`source === 'DOB_NOW'`): change button label to "Search on DOB NOW Build" and link to `https://a810-bisweb.nyc.gov/bisweb/bispi00.jsp` (public search portal, no deep-link available for DOB NOW filings)

### 4. UI — Add DSNY, FDNY, DEP, DOT, LPC, DOF to Violation Filter Buttons

In `DDReportViewer.tsx`, the hardcoded filter buttons currently only show `['all', 'DOB', 'ECB', 'HPD']`. This needs to be **data-driven** — generate the agency filter buttons dynamically from the actual agencies present in the violations data. This way all new agencies automatically appear when they have violations, with no further UI changes needed.

Replace:
```tsx
{['all', 'DOB', 'ECB', 'HPD'].map(f => ( ... ))}
```
With dynamic buttons generated from `[...new Set(violations.map(v => v.agency))]`.

Also update the Compliance Summary badge row (currently shows just DOB/ECB/HPD counts) to be dynamically generated from the agencies present.

### 5. UI — Fix "Applicant Information" Label in ExpandableApplicationRow

Change the section label from `"Applicant Information"` to `"Filing Professional (Architect/PE)"` for BIS source applications. This corrects the misleading label — the person listed is the licensed architect or PE who filed the job, not the contractor doing the work.

---

## Files to Change

| File | Change |
|---|---|
| `supabase/functions/generate-dd-report/index.ts` | Add `fetchOATHViolations()`, add `OATH_HEARINGS` endpoint, call for DSNY/FDNY/DEP/DOT/LPC/DOF in parallel inside `fetchViolations()`, rename `applicant_name` → `filing_professional_name` for BIS jobs |
| `src/components/dd-reports/ExpandableApplicationRow.tsx` | Fix external link: BIS→deep link, DOB_NOW→portal search; fix label "Applicant Information" → "Filing Professional (Architect/PE)" |
| `src/components/dd-reports/DDReportViewer.tsx` | Make violation filter buttons data-driven from actual agencies in violations array; update compliance summary to be dynamic |

---

## What Does NOT Change

- DOB, ECB, HPD fetching logic — untouched
- The normalized violation shape — new agencies use the same fields
- AI analysis prompt — it already handles generic violations
- The AI line-item notes format and key construction — unchanged
- All UI layout, authentication, client portal changes from the previous sprint
- No database migrations needed — `violations_data` JSONB column stores any shape

---

## Technical Note on OATH Query

The OATH dataset requires BBL broken into parts. We already parse BBL in `fetchViolations()`:
```
borough = bbl.slice(0, 1)   // "3"
block = bbl.slice(1, 6)     // "00410" 
lot = bbl.slice(6, 10)      // "0023"
```

The OATH query (per agency, run in parallel):
```
?issuing_agency=DEPT OF SANITATION
&violation_location_borough=BROOKLYN
&violation_location_block_no=00410
&violation_location_lot_no=0023
&$limit=100
&$order=violation_date DESC
```

Borough names needed for OATH (different from borough codes):
- `1` → MANHATTAN
- `2` → BRONX  
- `3` → BROOKLYN
- `4` → QUEENS
- `5` → STATEN ISLAND

This is the exact same logic already proven in CitiSignal.
