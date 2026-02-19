

# BinCheckNYC — NYC Property Due Diligence Report Tool

## Overview
A professional, dark-themed web app where users search by BIN or NYC address and instantly generate a comprehensive compliance report pulling live data from NYC Open Data APIs (DOB, ECB, HPD). Free to search; login required to save reports and export PDFs.

---

## Pages & Navigation

### 1. Landing / Search Page
- Hero section with BinCheckNYC branding and tagline
- Prominent search bar accepting BIN number or NYC address
- Auto-detect input type (numeric = BIN, otherwise address lookup)
- Dark professional theme with subtle accent colors
- No login required to search

### 2. Report Page
- **Property Header**: Address, BIN, block/lot, borough
- **Compliance Score Card**: Numeric score (0–100) with color-coded gauge, plus per-category breakdown (DOB, ECB, HPD) with severity weights
- **Violations Sections** (collapsible accordion panels):
  - **DOB Violations** — type, date, status, severity, with expandable detail rows for notes/descriptions
  - **ECB Violations** — penalty amount, status, hearing date, with expandable details
  - **HPD Violations** — class (A/B/C), status, inspection date, with expandable details
- **Permits & Applications Section**: DOB job filings, permit types, status, dates — collapsible rows
- **Summary Footer**: Total open vs. closed violations, key risk flags
- "Save Report" and "Export PDF" buttons (prompt login if not authenticated)

### 3. Auth Pages
- Email signup & login (clean modal or dedicated pages)
- Password reset flow

### 4. Dashboard (authenticated users)
- Saved report history with date, address, BIN, and compliance score
- Click to re-open any saved report
- Option to re-run a report to get updated data

---

## Compliance Scoring System
- Numeric 0–100 score where 100 = clean
- Weighted by source: HPD Class C violations weighted heaviest, DOB active violations next, ECB penalties factored by amount
- Per-category sub-scores (DOB, ECB, HPD) displayed as breakdown bars
- Color coding: Green (80–100), Yellow (50–79), Red (0–49)

---

## PDF Export
- Toggle between **BinCheckNYC branded** (logo, header, footer with disclaimer) and **white-label** (neutral, client-ready)
- Professional layout: property summary, score card, violation tables, permit history
- Generated client-side for instant download

---

## Backend (Lovable Cloud)

### Database
- **Users**: via Supabase Auth (email/password)
- **Profiles**: user metadata
- **Saved Reports**: user_id, BIN, address, report JSON data, compliance score, created_at

### Edge Functions
- **search-property**: Takes BIN or address, queries NYC Open Data APIs (DOB violations, ECB violations, HPD violations, DOB permits/applications), aggregates and returns structured data
- **calculate-score**: Computes the weighted compliance score from violation data

### Data Sources (NYC Open Data APIs — all free, no API key required)
- DOB Violations
- ECB Violations
- HPD Violations
- DOB Job Applications / Permits

---

## Design
- Dark professional theme throughout
- shadcn/ui components: Accordion for collapsible rows, Cards for sections, Tabs for violation categories, Badge for severity indicators
- Responsive layout for desktop and tablet use
- Clean data tables with sort/filter capabilities

