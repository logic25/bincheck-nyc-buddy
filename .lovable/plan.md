

# Apple-Esque Design with Red Accent + Property Guard Integration

## Design Direction

Apple's precision and restraint, but with a sharper edge. Think Apple meets Bloomberg Terminal -- premium and confident, not soft or friendly. A bold red accent says "we mean business" while the monochromatic dark palette keeps everything clean and authoritative.

**The vibe**: You open the app and immediately feel like this is the most serious tool in the space. Not cute, not playful -- precise, powerful, and unapologetically premium.

---

## 1. Color Palette

**Dark mode:**
- Background: `hsl(225, 12%, 7%)` -- deep space black
- Card: `hsl(225, 10%, 10%)` -- subtle lift, not soft
- Foreground: `hsl(0, 0%, 92%)` -- crisp off-white
- Primary accent: `hsl(0, 85%, 55%)` -- confident red, not cherry, not pastel
- Muted text: `hsl(220, 6%, 45%)` -- cool gray, readable
- Borders: `hsl(225, 8%, 15%)` -- barely there, sharp
- Score green: `hsl(145, 60%, 42%)`, yellow: `hsl(40, 80%, 52%)`, red: `hsl(0, 70%, 50%)`

**Light mode:** Clean white with same red accent for consistency.

**Font**: Swap Space Grotesk to **Inter** -- sharper, tighter, used by Linear/Vercel/Apple web. No rounded softness.

---

## 2. Landing Page

Strip it down to essentials -- no filler:
- Large, tight-tracked headline with red accent on key phrase
- Search bar: clean, sharp corners (rounded-lg not rounded-full), solid borders, generous padding
- Feature cards: no borders, subtle background lift, sharp hover states
- Subtle dot-grid or noise texture background for depth without softness
- Minimal footer

---

## 3. Report Page

The product's centerpiece -- it should feel like a premium document:
- Property header: full-width, clean grid layout for metadata
- Score card: circular progress ring with the red accent, large bold number
- Violations: clean tabbed tables with expandable rows (ported from Property Guard)
- Summary: large stat numbers, minimal labels, no clutter
- Actions: refined buttons, not cramped into a card

---

## 4. Property Guard Components to Port

New files ported and adapted from Property Guard:
1. `src/lib/violation-utils.ts` -- agency colors, portal URLs, status helpers
2. `src/components/dd-reports/ExpandableViolationRow.tsx` -- expandable violation rows with notes and links
3. `src/components/dd-reports/ExpandableApplicationRow.tsx` -- expandable application rows
4. `src/components/dd-reports/DDReportViewer.tsx` -- full report viewer with building info, filters, tabs, notes, PDF export
5. `src/components/dd-reports/DDReportPrintView.tsx` -- print/PDF layout with BinCheckNYC branding
6. `src/components/dd-reports/CreateDDReportDialog.tsx` -- new report creation dialog
7. `src/pages/DDReports.tsx` -- reports management page with status badges and search

All adapted: replace PropertyGuard branding, swap `useAuth` for direct Supabase calls, swap `useToast` for `sonner`.

---

## 5. Edge Function: `generate-dd-report`

Ported from Property Guard with full capabilities:
- NYC GeoSearch for address resolution
- PLUTO data (zoning, owner, year built, landmark status)
- Open/active violations only, stop work and vacate order detection
- DOB NOW + BIS job applications with deduplication
- AI risk analysis via Lovable AI (Gemini)
- Writes to `dd_reports` table

---

## 6. Database

New `dd_reports` table with columns for address, BIN, BBL, building/violations/applications/orders data (JSONB), AI analysis, notes, status, and timestamps. RLS policies restricting users to their own reports.

---

## 7. Dependencies

- `html2pdf.js` for PDF generation
- `react-markdown` for AI analysis rendering

---

## 8. Files Changed

| File | Action |
|------|--------|
| `src/index.css` | Red accent palette, Inter font, sharper variables |
| `tailwind.config.ts` | Inter font family, updated score colors |
| `src/pages/Index.tsx` | Redesign -- sharp, minimal, premium |
| `src/pages/Report.tsx` | Redesign -- circular score, refined layout |
| `src/pages/Dashboard.tsx` | Add DD Reports, red-accent styling |
| `src/pages/DDReports.tsx` | New -- reports management |
| `src/pages/Auth.tsx` | Restyle to match |
| `src/components/report/*` | Redesign all 6 report components |
| `src/lib/violation-utils.ts` | New -- ported from Property Guard |
| `src/components/dd-reports/*` | New -- 5 components ported |
| `supabase/functions/generate-dd-report/index.ts` | New -- ported edge function |
| `src/App.tsx` | Add /dd-reports route |
| Database migration | New dd_reports table + RLS |

