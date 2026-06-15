# Plan: Fix admin nav flicker, surface Bug Center, trim queue copy

## 1. Stop the nav flicker on route changes

Today every admin page (`Dashboard`, `AdminDocuments`, `AdminTeam`, `AdminAudit`, `AdminLeads`, `DDReports`) renders its own `<AdminNav />` *inside* the page body, and only after each page's auth/role gate resolves. On every click the nav unmounts with the page, then re-mounts after the loading skeleton — that's the flash.

Fix: introduce a persistent layout so the nav stays mounted across staff routes and only the inner content swaps.

- Create `src/components/admin/AdminLayout.tsx`:
  - Runs the role check **once** via `useUserRole`.
  - Renders `<AdminNav />` + `<Outlet />`.
  - While `isLoading`, render the nav (skeleton-free) + a small content skeleton — no full-page wipe.
  - If `!isStaff`, `<Navigate to="/dashboard" replace />`.
- Update `src/App.tsx` to wrap the staff routes in a single parent route using the layout:
  ```
  <Route element={<AdminLayout />}>
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/dd-reports" element={<DDReports />} />
    <Route path="/admin" element={<Admin />} />
    <Route path="/admin/team" element={<AdminTeam />} />
    <Route path="/admin/documents" element={<AdminDocuments />} />
    <Route path="/admin/audit" element={<AdminAudit />} />
    <Route path="/admin/leads" element={<AdminLeads />} />
  </Route>
  ```
  (Dashboard stays accessible to non-staff too — see note below.)
- Remove the in-page `<AdminNav />` render and the duplicate role gate/loading skeleton from each of those pages so the layout owns both.
- Dashboard caveat: `/dashboard` is used by both clients and staff. Keep the layout's "must be staff" check scoped to `/admin/*` and `/dd-reports` only; for `/dashboard` the layout should render the nav only when `isStaff`, and never redirect non-staff away. Cleanest split: two layouts — `<StaffLayout>` (gated, wraps `/admin/*` + `/dd-reports`) and `<DashboardLayout>` (always allows, conditionally renders the nav for staff).

Result: clicking between Documents → Team → Audit swaps only the content area; the nav bar never unmounts.

## 2. Add the Bug Center to the staff nav

The Bug Center already exists at `/help` (`src/pages/Help.tsx:959` renders `<BugReports />`) but isn't linked from `AdminNav`.

- Add a new item to `ITEMS` in `src/components/admin/AdminNav.tsx`:
  - `to: '/help'`, label `'Bugs'`, icon `Bug` (lucide), visible to all staff (`r.isStaff`).
- Active-state check already handles non-`/dashboard` prefixes correctly.

(No change to `/help` itself — it stays public for clients submitting bugs.)

## 3. Trim the Document queue blurb

The "Bulk PDF feeds (the way Jaffa/DataTrace operate)…" copy is hard-coded in `src/pages/AdminDocuments.tsx:295-300`. It's internal context, not user-facing value.

- Replace the paragraph with a single concise line: *"Tickets represent documents referenced in DD reports. Analysts fetch high-value PDFs (deeds, liens, vacate orders) from the agency portal and attach them here."*
- Move the Jaffa/DataTrace rationale into a small `<Tooltip>` / info `(i)` popover next to the heading for anyone who wants the backstory, so it's discoverable but not shouting from the header.

## Files touched

- `src/App.tsx` — wrap staff routes in layout(s)
- `src/components/admin/AdminLayout.tsx` *(new)* — persistent staff shell
- `src/components/admin/AdminNav.tsx` — add Bugs item
- `src/pages/Dashboard.tsx`, `src/pages/AdminTeam.tsx`, `src/pages/AdminDocuments.tsx`, `src/pages/AdminAudit.tsx`, `src/pages/AdminLeads.tsx`, `src/pages/DDReports.tsx` — remove in-page `<AdminNav />` + duplicate role gate
- `src/pages/AdminDocuments.tsx` — trim header copy, add tooltip

## Out of scope

- No DB / RLS / grant changes.
- No changes to `/help` itself or to the BugReports component.
- No visual redesign of the nav beyond the new item.
