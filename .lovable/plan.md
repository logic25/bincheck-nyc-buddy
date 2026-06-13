# DD Report Visual Redesign — Legal Document Style

Restyle both `src/components/dd-reports/DDReportPrintView.tsx` and `src/components/dd-reports/DDReportViewer.tsx` to match the reference (serif headlines, small-caps section labels, agency sub-scores, clean Property Overview grid) with your 3 required adjustments. No data, scoring, props, or query changes.

## Design tokens (inline constants, both files)

- `bg: #ffffff`, `surface: #fafaf7`, `text: #111827`, `muted: #6b7280`
- `border: #e5e7eb`, `navy: #1e3a8a` (existing brand navy preserved)
- Risk accents: `green #166534`, `amber #b45309`, `red #991b1b`
- `SERIF: 'Libre Baskerville', Georgia, serif` (already loaded)
- Body remains Inter

## Header block

- "BinCheckNYC Report" — serif 28px, weight 400
- "PROPERTY COMPLIANCE ASSESSMENT" — small-caps 11px, letter-spacing 0.18em, muted
- Right side: `Report ID: BC-XXXXXX` + `Issued: Jun 13, 2026`
- **NEW** Below header rule: `Data current as of [timestamp]` (11px muted)
- **NEW** `Confidential — prepared for named recipient only` (11px italic muted)
- Property address — serif 28px bold
- Two-column `PREPARED FOR` / `PREPARED BY` block (small-caps labels)

## Hero score card

- Off-white `#fafaf7` background, 12px radius, 1px border
- Score number: 72px serif weight 400, colored by band (green/amber/red)
- **Risk label = bordered rectangle** (1.5px border in band color, 4px radius, 10px small-caps, 6px×12px padding). Not a pill.
- 4 sub-score columns: DOB / ECB / HPD / OATH
  - Each: small-caps label, 28px score, `/100` muted below
  - Divided by 1px vertical rules
- **Below card: one-line summary** replaces the 4 large stat tiles, e.g. `7 open violations · 3 active applications · 0 stop-work orders · 0 vacate orders` (12px muted)

## Key Findings

- Two equal flex columns, each off-white card, 1px border, 16px padding, 8px radius
- Bulleted list 12px / 1.6 line-height
- Preserve existing bold + underline highlighting on signature terms

## Property Overview grid

- Navy header bar with small-caps title
- CSS grid `repeat(4, 1fr)`, collapses to `repeat(2, 1fr)` under 640px (and in `@media print`)
- 10px small-caps labels + 14px semibold values, 1px bottom border per cell

## Open Violations table

- 1px `#e5e7eb` borders, 10px uppercase small-caps headers
- 11px body, alternating row bg `#ffffff` / `#fafaf7`
- PRIORITY column as bordered rectangle label (same component as hero risk label)
- Dates `MM/dd/yy`, money right-aligned

## Conclusion section

- Navy small-caps header, 12px / 1.7 body
- `complianceScore.overrideReasons` shown italic if present
- **Remove** "BinCheckNYC Analyst Team" signoff
- **NEW** Final line: `DATA SOURCES: NYC DOB · ECB/OATH · HPD · FDNY · ACRIS` (10px small-caps muted)

## Print footer (PrintView only)

- `@page { margin: 0.6in 0.5in 0.8in; }`
- `position: fixed; bottom: 0` footer band, 1px top border, 9px `#6b7280`
- Left: `BinCheckNYC · Report BC-XXXXXX`
- Right: `Page <span class="pageNumber"></span> of <span class="totalPages"></span>` (html2pdf pagination hooks)

## Scope confirmed

- **Both viewer + print** get the restyle (top blocks of viewer match print exactly; viewer keeps its existing interactive tabs/sections below the hero)
- Font: **Libre Baskerville** (already loaded — no new font imports)
- No changes to data fetching, scoring weights, props, component split, or html2pdf config beyond the `@page` rule
- No new dependencies

## Verification

- Render `/dd-reports/:id` at 1527px and screenshot
- Generate a PDF via existing export button; verify page footer + page numbers
- Confirm all existing fields still render (no data lost)
- TypeScript builds clean
