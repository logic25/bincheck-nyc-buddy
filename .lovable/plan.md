

# AI-Generated Line-Item Notes + PDF Print View Improvements

## What Changes

### 1. Customer Concern Field
Add a "Customer Concern" textarea to the report creation dialog so the customer can describe what they care about (e.g., "I'm buying Unit 10B, want to ensure no violations affect it and future combination work is possible").

**Database**: Add `customer_concern text` column to `dd_reports`.

### 2. AI-Generated Line-Item Notes (You Review + Edit)
After the edge function fetches all violations and applications, a second AI call generates a note for each item -- just like the 361 Clinton Ave sample:
- "related to elevator; no impact on unit 10B"
- "exterior facade repairs; no impact on unit 10B"
- "LAA for kitchen work; no impact on unit 10B"

These notes are saved as `line_item_notes` JSONB (column already exists). The report status becomes `pending_review` instead of `completed`. You can then edit any note in the viewer before approving.

### 3. Visible Notes Column in Viewer Tables
Currently notes are hidden inside expandable rows. Add a "Notes" column directly in the violations and applications tables so you can see the AI-generated note at a glance, click to edit inline.

### 4. Approve/Finalize Flow
Add an "Approve & Send" button (admin only) that changes status from `pending_review` to `approved`. Notes become read-only after approval.

### 5. PDF Print View Matching Sample Reports
Restructure `DDReportPrintView.tsx` to match the 361 Clinton Ave format:

**Violations**: Group by agency with notes column
```text
DOB Violations - 8
- V053014ACC107208 - related to elevator; no impact on unit 10B
- V053014ACC107207 - related to elevator; no impact on unit 10B
```

**Applications**: Split into two tables with columns matching the sample:

BIS Applications:
| Application # | Date Filed | Floor | Description | Notes |

DOB NOW Build Applications:
| Application # | Date Filed | Floor/APT | Description | Notes |

**Conclusion section**: AI-generated summary paragraph (like "Unit 10B is clean from a DOB perspective...")

### 6. Customer Concern in AI Analysis Prompt
The existing `generateAIAnalysis` prompt gets the customer concern so the risk assessment is tailored (e.g., focuses on whether anything impacts Unit 10B).

---

## Technical Details

### Database Migration
```text
ALTER TABLE public.dd_reports ADD COLUMN IF NOT EXISTS customer_concern text;
```

### Files to Modify

| File | Changes |
|------|---------|
| `CreateDDReportDialog.tsx` | Add "Customer Concern" textarea, pass to edge function |
| `generate-dd-report/index.ts` | Accept `customer_concern`, add `generateLineItemNotes()` AI call using tool calling for structured output, set status to `pending_review`, include concern in risk analysis prompt |
| `DDReportViewer.tsx` | Add "Notes" column to violations + applications tables (8th column), add "Approve & Finalize" button for admins, show `customer_concern` in header |
| `ExpandableViolationRow.tsx` | Add visible Notes cell showing AI note (editable), update colSpan |
| `ExpandableApplicationRow.tsx` | Add visible Notes cell showing AI note (editable), update colSpan |
| `DDReportPrintView.tsx` | Restructure to match sample: group violations by agency with notes, split apps into BIS/DOB NOW tables with Date Filed/Floor/Description/Notes columns, add conclusion section, include line-item notes |

### AI Note Generation (Edge Function)
After fetching data, call Lovable AI with tool calling to get structured notes:

```text
Prompt: "You are reviewing NYC DOB/ECB/HPD records for [address].
Customer concern: [customer_concern]

For each violation and application, write a brief note assessing
impact relative to the customer's concern.
Format: '[brief what it is]; [impact assessment]'
Examples: 'related to elevator; no impact on unit 10B'
          'exterior facade repairs floors 1-ROF; no impact on unit 10B'"
```

Tool schema returns:
```text
{ notes: [{ item_type, item_id, note }] }
```

### Report Status Flow
```text
generating -> pending_review -> approved
                  ^                |
                  |  (edit notes)  |
                  +----------------+
```

### Viewer Table Layout (New)
Violations table adds 8th column "Notes":
| | Violation # | Agency | Type | Severity | Issued | Status | Notes |

Applications table adds 8th column "Notes":
| | Job # | Job Type | Status | Filed | Description | Floor/Apt | Notes |

Notes cell shows truncated AI note with a small edit icon. Clicking opens inline edit.

