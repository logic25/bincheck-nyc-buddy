
# Full System Audit + Fixes: Report Page, All Pages, AI Prompt, Pricing

---

## Issue 1: Why `/report?address=708 E Tremont` Returned a Blank Screen

The screenshot shows a completely blank preview pane at `/report`. This is a known failure mode in the current `Report.tsx`. Here's what's happening:

The `search-property` edge function is invoked with `address=708 EAST TREMONT AVENUE, Bronx, NY, USA`. The GeoSearch API resolves this to a BIN + BBL. The edge function then fetches DOB/ECB/HPD/OATH data and returns a `PropertyData` object. The report renders only when **both** `data && score` are truthy.

The blank screen means one of:
1. The edge function errored silently — `data.error` is set but not displaying because the UI only shows a destructive text block when `error` (the React Query error) is thrown, not when `data.error` is a string
2. The `score` calculation returned `null` because `data.dobViolations`, `data.ecbViolations`, or `data.hpdViolations` are undefined (not empty arrays), causing the scoring to crash

The fix for Report.tsx:
- Defensive null checks in score calculation — treat undefined arrays as `[]`
- Show an explicit "no data found" state when `data` returns but `score` is null
- Show the actual `data.error` string in the error state, not just the React Query error

---

## Issue 2: The AI System Prompt — What It Actually Says vs. What It Should

### Current system role (line 418):
```
"You generate brief per-item notes for NYC property due diligence reports. 
Return structured JSON via the tool call."
```
This is the casual version. The improved version from the plan has NOT been applied to the system role yet — only the user prompt was updated.

### The full expert prompt upgrade (to implement):

**System role → replace line 418:**
```
You are a licensed NYC real estate compliance analyst and paralegal specialist 
with 15 years of experience reviewing DOB, ECB, HPD, FDNY, DSNY, DOT, LPC, 
and DOF records for transactional due diligence. Your notes are read by real 
estate attorneys, title companies, and sophisticated investors. Be precise, 
professional, and attorney-ready. Return structured JSON via the tool call.
```

**Full user prompt upgrade — replace lines 385-409:**

The key additions beyond what's currently there:
- 4-prefix system: `[ACTION REQUIRED]` / `[MONITOR]` / `[RESOLVED]` / `[INFO]`
- ECB default judgment logic: if `hearing_result` contains "DEFAULT" → flag separately as default judgment
- Stop Work Order → explicitly state "Cannot close title with active SWO"  
- Vacate Order → "Blocks occupancy; must be lifted before transaction"
- HPD Class C → "Must be corrected within 24 hours of issuance"
- PARTIAL permit → full explanation: "Only part of the proposed scope was approved — may indicate phased work, scope reduction, or a stalled project"
- Unit matching: if concern mentions a unit (e.g., "Unit 4B"), compare item's floor/apt against it
- Combination unit concern: flag any active alteration jobs on relevant floors
- Building-wide system vocabulary: FAÇADE, ELEVATOR, GAS, BOILER, SPRINKLER → always building-wide, flag regardless of unit concern

---

## Issue 3: Full Page-by-Page Audit — What to Change

### Page: `/` (Home/Marketing) — `Index.tsx`

**Current state:** Minimal. Logged-out users see hero text + search box + 3 feature cards. No pricing, no CTA to order, no trust section.

**Changes needed:**
- Add a full-width **Pricing section** below the feature cards (logged-out only):
  ```
  One-Time Report  $149    |   Professional  $499/mo · 5 reports
  [Order a Report]         |   [Start Plan]
  ```
- Add a **"How It Works" section** (3 steps: Submit → We Prepare → Download)
- Add a footer trust line with all agency sources (already exists, extend it)
- Nav: add "Order a Report" as a primary button for logged-out users (currently only has Log In / Sign Up)
- The existing search box stays as the primary hero interaction

**Files:** `src/pages/Index.tsx`

---

### Page: `/order` — New Page (Doesn't Exist)

**Purpose:** Public attorney intake. Three steps with Stripe UX (not wired, just UI).

**Step 1 — Property:**
- NYC address autocomplete (same GeoSearch component pattern as Index.tsx)
- Customer concern textarea
- Preferred delivery date (date picker, min = tomorrow)
- Rush toggle: "Rush delivery — guaranteed within 4 business hours (+$50)"

**Step 2 — Contact:**
- First name, last name, email, law firm/company, phone (optional)

**Step 3 — Plan & Payment (Stripe UX, not wired):**
```
┌──────────────────────┐  ┌──────────────────────────┐
│  One-Time Report     │  │  Professional Monthly     │
│  $149                │  │  $499 / month             │
│  + $50 if rush       │  │  5 reports · priority     │
│  24hr delivery       │  │  Rush at no extra charge  │
│  [Pay & Order →]     │  │  [Subscribe & Order →]    │
└──────────────────────┘  └──────────────────────────┘
  "Secure payment via Stripe"  [🔒 SSL secured]
```

Clicking either button shows a "Payment processing..." state (mocked — Stripe not wired yet) then redirects to a confirmation screen:
```
✓ Order received!
We're preparing your report for [address].
You'll receive an email at [email] when it's ready.
Expected delivery: [date]  [RUSH badge if applicable]
[Track your report →]
```

**DB migration needed:**
```sql
ALTER TABLE dd_reports
  ADD COLUMN IF NOT EXISTS rush_requested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS requested_delivery_date date,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_amount integer,
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_firm text;
```

**Files:** `src/pages/Order.tsx` (new), `src/App.tsx` (add route)

---

### Page: `/dashboard` — Client Portal

**Current state:** Has stat cards + "My Reports" tab (DD reports list with timeline) + "Quick Searches" tab (now fixed with inline search). Generally solid.

**Remaining gaps:**
1. **Empty state in "My Reports"** still says "Contact GLE to get started" with no CTA button. Should be `[Order a Report →]` linking to `/order`
2. **Rush badge** missing — when `rush_requested = true` on a report row, show a red "RUSH" badge with "Due by [time]"
3. **Delivery date** — "Expected by Feb 21" on pending reports
4. **Header CTA** — "Order a Report" button in the header (always visible) linking to `/order`

**Files:** `src/pages/Dashboard.tsx`

---

### Page: `/dd-reports` — Admin Work Queue

**Current state:** Flat list, no status filters, newest-first sort. Status badges use stale labels (`completed` instead of `approved`/`pending_review`). No rush indicators. No payment column.

**Changes needed:**

1. **Status filter tabs** across the top:
   ```
   [All (12)] [Generating (2)] [Pending Review (5)] [Approved (5)]
   ```
   Default selected: "Pending Review" (most urgent)

2. **Sort fix** — Pending Review tab should sort by `created_at ASC` (oldest first = most overdue first). Other tabs default to newest first.

3. **Fix status label map** — `getStatusVariant` currently maps `'completed'` which is unused. Map:
   - `approved` → green badge "Approved"
   - `pending_review` → amber badge "Pending Review"
   - `generating` → blue/gray "Generating" with spinner
   - `error` → red "Error"
   - `draft` → outline "Draft"

4. **Rush indicator** — if `rush_requested = true`, show `🚨 RUSH` red badge before the status badge, and show "Due by [time]" in the row

5. **Payment status column** — show `payment_status` field as a badge (Paid / Unpaid) in the row

6. **Client firm** — show `client_firm` or `prepared_for` under the address in the row

7. **"New Report" button** stays — admins can still create internal reports

8. **CreateDDReportDialog** — add Rush toggle and Delivery Date picker to the form

**Files:** `src/pages/DDReports.tsx`, `src/components/dd-reports/CreateDDReportDialog.tsx`

---

### Page: `/settings` — Profile Settings

**Current state:** Has Profile tab (name, company, phone, license ID) + Security tab (password change) + Account tab (sign out). Functional but basic.

**Changes needed:**
1. **"My Plan" tab** — new tab showing:
   - Current plan: One-Time / Professional / Enterprise (or "No active plan")
   - Reports this billing period: X of Y used
   - Renewal date (placeholder)
   - [Manage Billing] button → placeholder toast "Stripe billing portal coming soon"
2. **Email field** — show the account email (read-only) at the top of the Profile tab

**Files:** `src/pages/Settings.tsx`

---

### Page: `/admin` — Super-Admin User Management

**Current state:** Has Users and Reports tabs. Users tab lists profiles, Reports tab lists all DD reports.

**Gap:**
- No link from a user row to "view their reports" (filtered `/dd-reports` view). Add an [Eye] icon → navigate to `/dd-reports?userId=...` or inline expand.

---

### Page: `/report` — Quick Search Report

**Current state:** Shows loading spinner, error state, then `PropertyHeader + ScoreCard + ViolationsSection + PermitsSection + ReportSummary + ReportActions`. **But it's blank for 708 E Tremont.**

**Fix needed:**
- Defensive null in `calculateComplianceScore` — if any of `data.dobViolations`, `data.ecbViolations`, `data.hpdViolations` is undefined, treat as `[]`
- Add a fallback state when `data` is returned but `score` is null: "Report data received but score could not be calculated"
- Show `data.error` if it exists even when React Query doesn't throw
- Add a "Generate DD Report for this property" CTA button on the report page — so attorneys who search quickly can immediately escalate to a full report

**Files:** `src/pages/Report.tsx`, `src/lib/scoring.ts`

---

## Issue 4: Pricing Analysis — $149 vs. Higher

### Cost Structure (realistic estimate for early-stage):

**Per-report variable costs:**
- AI inference (Gemini Flash for 100 violations + analysis): ~$0.05–0.15
- Edge function compute: negligible
- NYC Open Data API: free
- GeoSearch API: free

**Fixed startup costs (one-time):**
- Entity setup (LLC): ~$500
- Domain + hosting: ~$200/yr  
- E&O insurance (professional liability, critical for legal-adjacent tool): **$1,500–3,000/yr**
- Accounting/legal: ~$1,000/yr
- Total Year 1 fixed: ~$3,500–5,000

**Employee cost (when hired):**
- Part-time QC reviewer (your "human-in-the-loop"): ~$25–40/hr, 2 hrs/report
- At 10 reports/month: $500–800/month in labor

### Revenue math at $149:

```
10 reports/month:  $1,490 revenue  →  ~$700 labor = $790 margin
20 reports/month:  $2,980 revenue  →  ~$1,400 labor = $1,580 margin
50 reports/month:  $7,450 revenue  →  ~$3,500 labor = $3,950 margin
```

Year 1 at 20 reports/month: ~$35,760 gross, ~$19k after labor + fixed.

### What NYC attorneys actually pay for comparable services:
- **PropertyShark** (public records deep dives): $50–150/search, no report format
- **First American / Fidelity title searches**: $300–600 per transaction
- **Manual paralegal time** for DOB/ECB research: 2–4 hours at $75–150/hr = **$150–600**
- **Compliance research firms**: $200–500/report, often PDF-only with no AI

### Recommendation on pricing:

**$149 is actually at the low end for attorneys.** These are professionals billing $300–500/hour themselves. The relevant comparison is:
- Their paralegal spending 2 hours doing this manually = $150–300 in staff time
- Your product is faster, more comprehensive (6 agencies), and AI-annotated

**Suggested pricing architecture:**

```
One-Time Report:     $199  (was $149 — raise it, attorneys won't flinch)
Rush Add-On:         +$75  (was +$50 — matches the urgency premium)

Professional Plan:   $599/mo · 5 reports ($120/report)  
                     Includes priority queue + white-label PDF

Enterprise:          Contact us / custom invoice
                     (law firms, title companies — 20+ reports/mo)
```

**Why raise to $199:**
1. E&O insurance requires you to price professionally — underpricing signals low quality to attorneys
2. At $199, you're still 30–50% cheaper than paralegal time
3. Higher price = more time to do quality QC per report = better product
4. Stripe's per-transaction fee ($0.30 + 2.9%) is ~$6 at $199 vs. ~$4.63 at $149 — negligible
5. $199 is a psychological "under $200" anchor, like $149 is "under $150" — same effect

**Rush pricing at $75:**
- 4-hour turnaround requires your active involvement
- $75 additional makes it feel like a real premium, not a token add-on
- Professional precedent: same-day courier adds 50-100% premium

---

## Implementation Order

All of this is one coherent implementation sprint:

1. **DB migration** — add rush/payment/delivery columns to `dd_reports`
2. **Fix `Report.tsx` + `scoring.ts`** — defensive nulls, fix blank screen
3. **Upgrade AI prompt** — expert system role + 4-prefix system + full severity logic
4. **`Index.tsx`** — add pricing section + How It Works + Order CTA in nav
5. **`src/pages/Order.tsx`** (new) — 3-step form with Stripe UX mockup
6. **`src/App.tsx`** — add `/order` route
7. **`Dashboard.tsx`** — empty state CTA → `/order`, rush badges, header order button
8. **`DDReports.tsx`** — status tabs, sort fix, status label map, rush indicators
9. **`CreateDDReportDialog.tsx`** — rush toggle + delivery date
10. **`Settings.tsx`** — "My Plan" tab with billing placeholder

All in one pass. No separate migrations needed beyond the one SQL block. No new dependencies needed.
