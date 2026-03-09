

## Plan: Remove AI Analysis & Skip HPD for Non-Residential Properties

### 1. Remove AI Analysis Tab & PDF Section

**Files to modify:**

- **`src/components/dd-reports/DDReportViewer.tsx`**
  - Remove `aiAnalysis` / `isEditingAI` state variables
  - Remove `{ key: 'analysis', label: 'AI Analysis', icon: Shield }` from `sectionNav`
  - Remove the entire `activeSection === 'analysis'` block (~lines 1297-1336)
  - Remove `ai_analysis` from the save function
  - Remove `ai_analysis` from the print view data pass

- **`src/components/dd-reports/DDReportPrintView.tsx`**
  - Remove the "Risk Assessment & Conclusion" section (~lines 581-600)
  - Remove `ai_analysis` from the report type

- **`supabase/functions/generate-dd-report/index.ts`**
  - Stop generating AI analysis content (remove the AI analysis prompt/call)
  - Still store `ai_analysis: null` so existing reports don't break

### 2. Skip HPD for Commercial Buildings

**File: `supabase/functions/generate-dd-report/index.ts`**

- After fetching PLUTO data, check `bldgclass` or `landuse` to determine building type
- PLUTO `landuse` codes: `01`-`03` = residential/mixed residential → query HPD; `04`+ (commercial, industrial, etc.) → skip HPD
- When HPD is skipped, include a note in `agencies_queried` like `"HPD: Skipped (commercial property)"`
- This avoids showing an empty HPD section that implies the agency was checked and found nothing, when it was simply not applicable

### 3. No Database Changes Required
The `ai_analysis` column stays in the table (existing reports retain their data), we just stop generating and displaying it.

