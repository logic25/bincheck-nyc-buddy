
# Cleanup: License ID, Footer, Data Sources, Page Navigation & Workflow

## Issues to Fix

### 1. Remove "License ID" from Settings Profile tab

**Why it's there:** It was added early as a placeholder assuming the user was a licensed professional (like an architect or attorney). It's not relevant — BinCheckNYC doesn't verify licenses, and customers could be anyone.

**Fix:** Remove the License ID field entirely from `src/pages/Settings.tsx`. The profile form becomes: Email (read-only) → Display Name → Company Name → Phone → Save. This is all that's needed.

---

### 2. Remove the "Data Sources" footer section from Index.tsx

**Why it's wrong:** The footer currently says:
> "Data Sources — Reports draw from NYC Department of Buildings (DOB), Environmental Control Board (ECB)..."

You're right — this is information competitors could use, and it adds no value to the visitor experience. It creates unnecessary clutter and frankly looks amateurish on a marketing page.

**Fix:** Remove the "Data Sources" `<p>` and heading entirely. Keep only:
1. The **Disclaimer** (professional, liability-protecting — this stays and is important)
2. The copyright line
3. Optionally a contact link

The disclaimer currently reads well and covers liability. It will remain but without the data source attribution block.

---

### 3. "Everything in One-Time" — clarify what that means on the Professional plan

**Problem:** The Professional plan feature list says "Everything in One-Time" which is meaningless without context of what One-Time includes. Visitors reading the Professional card don't see the One-Time card features first.

**Fix:** Replace "Everything in One-Time" with an explicit short list of what's included across both plans. The One-Time plan card should list its own features explicitly (no "see above" style references). Professional gets its own additive list.

**One-Time features (explicit):**
- Full DOB, ECB & HPD violation analysis
- FDNY, DSNY, DOT, LPC & DOF checks
- AI-annotated compliance notes
- Downloadable PDF report
- Typical turnaround: 24–48 business hours

**Professional adds:**
- Priority processing queue
- Rush delivery at no extra charge
- White-label PDF option
- Rollover unused reports
- Dedicated support

---

### 4. Page Navigation Workflow — How to Get to Settings

**The confusion:** You're asking "how do I get to Settings?" Looking at the screenshot, the nav bar shows: `Dashboard | DD Reports | Settings | [vertical bar icon]`. Settings IS in the top nav. But it's not obvious which users see what.

**Current navigation map:**
```text
/ (Home/Marketing)
  ├── Logged OUT nav: Log In | Pricing | Order a Report
  └── Logged IN nav: Dashboard | DD Reports | Settings | [Admin] | Sign Out

/dashboard  → client portal (My Reports + Quick Searches tabs)
/dd-reports → admin/internal work queue
/order      → public intake form (3-step)
/settings   → profile, plan, security, account tabs
/admin      → super-admin user management
/report     → quick property search result
```

**The workflow confusion in the screenshot:** The page shown is `/` (home) but it's showing the "Property Search" view (logged-IN state), meaning you're logged in. The nav bar shows `Dashboard | DD Reports | Settings` — clicking Settings takes you there.

**The deeper UX issue:** When logged in, the home page (`/`) shows just the search bar with "Property Search" text — it doesn't show the marketing sections (pricing, how it works, etc.) because those are hidden behind the `!session` condition. This is correct behavior (logged-in users don't need the marketing pitch), but it means the home page looks very sparse for logged-in admins.

**Fix:** For logged-in users, the home page should redirect or at least show a more useful state. Specifically: if logged in, the `/` home page should automatically `navigate('/dashboard')` instead of showing the search-only view. The quick search is now IN the dashboard (Quick Searches tab), so the home page search is redundant for logged-in users.

---

### 5. "I Ordered a Report and Logged In but No Report" — the workflow gap

**What happened:** You went through `/order`, which creates an `order_leads` record (email capture), but it does NOT create a `dd_reports` record. The order is captured as a lead; an admin then manually creates the DD report in the admin queue. So the dashboard shows zero reports because no report has been created yet.

**This is the intended flow:**
```text
Client → /order → fills form → lead captured → payment (mocked) → 
Admin notified → Admin creates DD report in /dd-reports → 
Report appears in client's /dashboard → Client notified by email
```

But this flow is invisible to the client — they complete the order, see the confirmation screen, and then... nothing shows in their dashboard.

**Fix:** Add a "Pending Orders" section to the dashboard that queries the `order_leads` table by the user's email and shows any pending/processing orders with status "Your report is being prepared." This bridges the gap between order submission and report delivery.

---

## Files to Change

| File | Change |
|------|--------|
| `src/pages/Settings.tsx` | Remove License ID field from profile form |
| `src/pages/Index.tsx` | Remove "Data Sources" block from footer; keep only disclaimer + copyright; add redirect to `/dashboard` for logged-in users; fix "Everything in One-Time" feature list |
| `src/pages/Dashboard.tsx` | Add "Pending Orders" section querying `order_leads` by email, showing orders awaiting report creation |

## What Does NOT Change
- The disclaimer text stays (liability protection is important)
- The order flow itself
- Admin panel, DD reports, auth flow
- The professional plan pricing already set at $599/mo

