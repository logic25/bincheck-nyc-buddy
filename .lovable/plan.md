

## Analysis

Looking at the two pages, here's what each contains:

**Dashboard (`/dashboard`)** — "Welcome [Name]"
- Stat cards (Total, Needs Review, Generating, Approved)
- Admin "Needs Attention" queue (top 5 reports, links to Report Manager)
- Client "Pending Orders" section
- "My Reports" tab (client view of their DD reports with status timeline)
- "Quick Searches" tab (BIN lookup history)

**Report Manager (`/dd-reports`)** — admin only
- Orders tab (incoming order leads)
- Queue tab (full report list with status filters, create/view/delete)
- Edit Review, Architect Letters, AI Learning tabs

The overlap: for admins, Dashboard shows a trimmed "Needs Attention" queue that just links to Report Manager. It's essentially a pass-through. For clients, Dashboard is the only page they use.

## Plan: Merge into a single `/dashboard` page

Make `/dashboard` the single hub for both roles. Remove `/dd-reports` as a separate page.

### For admins, Dashboard becomes:
- "Welcome [Name]" header + stat cards (keep)
- Tabs: **Queue** (current DD Reports queue), **Orders** (incoming leads), **Edit Review**, **Architect Letters**, **AI Learning**
- Remove the redundant "Needs Attention" preview section (it's now inline)
- Remove "My Reports" / "Quick Searches" tabs for admins (not relevant)

### For clients, Dashboard stays the same:
- Welcome + stat cards
- Pending Orders
- My Reports / Quick Searches tabs

### Navigation changes:
- Remove "Report Manager" from nav; admins land on `/dashboard` which has everything
- `/dd-reports` redirects to `/dashboard`
- "Home" link points to `/dashboard` for authenticated users

### File changes:
1. **`src/pages/Dashboard.tsx`** — Import and render the admin tabs (Queue, Orders, Edit Review, Architect Letters, AI Learning) from DDReports components when `isAdmin`. Remove the "Needs Attention" preview section. Move the relevant query logic and components from DDReports into Dashboard (or import them as sub-components).

2. **`src/pages/DDReports.tsx`** — Simplify to a redirect to `/dashboard`.

3. **`src/pages/Index.tsx`**, **`src/pages/Settings.tsx`**, **`src/pages/Help.tsx`** — Remove "Report Manager" nav link. Keep "Home" pointing to `/dashboard`.

4. **Nav bars across pages** — Simplify: Home (dashboard), Settings, Help Center, Sign Out. No separate Report Manager link needed.

### Technical notes:
- The DDReports page has ~600 lines of logic (report queries, mutations, order lead queries, create dialog, batch edit). Rather than dumping all that into Dashboard, we'll extract the admin content into a new component like `src/components/admin/AdminReportManager.tsx` that Dashboard conditionally renders.
- Client view stays untouched inside Dashboard.
- The `CreateDDReportDialog`, `DDReportViewer`, and status filter logic all move into the extracted component.

