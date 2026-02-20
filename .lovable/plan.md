
# Client Portal — Making the Logged-In Experience "Wow"

## What the Client Sees Today

Right now, when an attorney (or any client) logs in they land on a basic "Saved Searches" dashboard showing a list of BIN lookups with a score badge. The DD Reports section is a separate page that functions as your internal team tool. There is no unified client experience — it reads like an admin panel, not a client portal.

---

## What We're Building: A Unified Client Portal

The goal: when an attorney logs in, they see a polished, professional portal that feels like it was built specifically for them. Everything organized, nothing confusing.

### The New Client Dashboard (`/dashboard`)

Replace the current plain list with a proper portal homepage:

**Top section — At a Glance cards:**
- Total DD Reports ordered
- Reports pending / in review
- Reports approved and ready

**Main content — Two tabs:**
1. **My Reports** — Shows all DD reports with status badges (Generating, Under Review, Ready), address, date ordered, and a "View Report" button. No admin controls visible.
2. **Quick Searches** — The existing saved BIN searches list, moved here as a secondary tab.

**Empty state** — When they have no reports yet, a clean call-to-action: "Order your first DD Report" that links to `/dd-reports`.

---

### Client-Facing Report View (Read-Only)

When a client clicks into a completed/approved report, they see a clean read-only viewer — no edit buttons, no save/regen/delete controls, no "Approve" button. Just:
- The professional report layout (building info, compliance summary, violations with notes, applications with notes)
- AI Risk Assessment section (read-only, rendered Markdown)
- A prominent **Download PDF** button
- Their customer concern shown at the top as "Scope of Review"

The notes your team has reviewed and approved show cleanly in the table — exactly what the attorney cares about: "Is this my problem or not?"

---

### Status Flow the Client Sees

Instead of raw status strings like `pending_review`, they see human-friendly labels:

| Internal Status | Client Sees |
|---|---|
| `generating` | "Being Prepared" (with spinner) |
| `pending_review` | "Under Review by GLE Team" |
| `approved` | "Ready to Download" (green, prominent) |
| `draft` | "Draft" |

---

### What Makes It "Wow"

1. **Status timeline** — A small visual progress tracker on each report card: Ordered → Being Prepared → Under Review → Ready. Like a package tracker. Clients love this — they know exactly where their report is.

2. **Report card design** — Each report card shows: address prominently, their concern/scope in italic, ordered date, status pill, and a big "View Report" or "Download PDF" CTA depending on status.

3. **Clean navigation** — No "Admin", no "Regen", no internal tool language. The nav for a non-admin user is just: Logo | My Reports | Settings | Sign Out.

4. **PDF download front and center** — When a report is approved, the PDF button is the #1 action. One click, done.

5. **Professional empty state** — First-time users see a clear onboarding message: "Your reports will appear here once you've placed an order. Contact GLE to get started." (Until the self-serve order page is built.)

---

## Technical Plan

### Files to Modify

**`src/pages/Dashboard.tsx`** — Full redesign:
- Replace the saved-searches-only list with a proper portal layout
- Add at-a-glance stat cards (total reports, pending, ready)
- Query `dd_reports` table (not just `saved_reports`) for the user's DD reports
- Show status timeline per report card
- Filter: client only sees their own reports (RLS already enforces this)
- Tab between DD Reports and Quick Searches
- Non-admin users: hide all internal controls

**`src/pages/DDReports.tsx`** — Split behavior by role:
- Admin view: current internal tool as-is (full controls, edit notes, approve button)
- Non-admin / client view: redirect to `/dashboard` — clients don't need this raw page

**`src/components/dd-reports/DDReportViewer.tsx`** — Add a `readOnly` prop that hides all editing UI:
- When `isAdmin === false` and `status === 'approved'`, render in pure client view mode
- No Save, Regen, Delete, or Approve buttons shown
- Notes column shows the approved notes as plain text (not editable textareas)
- PDF download button is prominent at top

**`src/pages/Dashboard.tsx`** — Navigation cleanup:
- Logged-in non-admin nav: `My Reports | Settings | Sign Out` (no Admin link, no raw DD Reports link)
- Admin nav: unchanged (full access)

### No Database Changes Needed

The `dd_reports` table already has everything needed:
- `status` — drives the status timeline
- `customer_concern` — shown as Scope of Review
- `line_item_notes` — displayed in read-only notes column
- `ai_analysis` — rendered as Markdown in Risk Assessment section
- RLS already ensures clients can only see their own reports

### New Component: `ReportStatusTimeline`

A small reusable component showing 4 steps as connected dots:

```text
● Ordered  →  ● Being Prepared  →  ● Under Review  →  ● Ready
(filled)      (spinning if active)   (filled if past)   (green if done)
```

Used on both the dashboard card list and inside the report viewer header.

---

## What Stays the Same

- The internal DD Reports tool at `/dd-reports` — unchanged for GLE team
- Admin controls, note editing, approve button — unchanged, admin-only
- PDF export logic — unchanged
- All existing RLS policies — unchanged
- Auth flow — unchanged

---

## Summary of Changes

| File | Change |
|---|---|
| `src/pages/Dashboard.tsx` | Full redesign: stat cards, DD report list with status timeline, tabs for Reports vs Quick Searches |
| `src/pages/DDReports.tsx` | Non-admins redirected to /dashboard; page stays as internal tool for GLE team |
| `src/components/dd-reports/DDReportViewer.tsx` | Add client read-only mode: hides all edit/admin controls when non-admin viewing approved report |
| New `src/components/dd-reports/ReportStatusTimeline.tsx` | Visual 4-step progress tracker component |
