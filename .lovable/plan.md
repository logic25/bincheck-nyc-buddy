
# Build Everything In One Go — Full Plan

Two major clusters built simultaneously: **Fulfillment Workflow** and **Help Center**. No Clarity tab (deferred). Total scope: 4 database migrations, 1 new edge function, 1 edge function update, 1 new page, 3 updated pages, 1 updated component.

---

## Cluster 1: Fulfillment Workflow

### 1A. Database Migration — Link leads to reports + admin can update leads

Two schema changes:

```sql
-- Add order_lead_id to dd_reports to trace which lead spawned a report
ALTER TABLE dd_reports ADD COLUMN IF NOT EXISTS order_lead_id uuid;

-- Add RLS UPDATE policy on order_leads so admins can mark converted = true
CREATE POLICY "Admins can update order leads"
ON public.order_leads
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```

Without the UPDATE policy, the "Start Report" button cannot flip `converted = true` on an order lead — it would silently fail RLS.

---

### 1B. DDReports.tsx — New "Incoming Orders" tab

**What changes:**
- Add a new top-level tab called **"Incoming Orders"** before the existing status filter tabs
- Query `order_leads WHERE converted = false ORDER BY created_at ASC` (oldest first = most urgent)
- Each order card shows: address, client name, company, email, phone, rush badge, expected delivery date
- A **"Start Report"** button on each card that:
  1. Creates a `dd_reports` row pre-filled from the order lead: `address`, `prepared_for` (full name), `client_email`, `client_firm`, `rush_requested`, `requested_delivery_date`, `customer_concern`, `status: 'generating'`, `order_lead_id`, `user_id` (set to the admin's own `user_id` as a placeholder — the report will be linked to the client via `client_email`)
  2. Sets `order_leads.converted = true` on the lead
  3. Invokes `generate-dd-report` with the new `reportId` and `address`
  4. Navigates directly into `DDReportViewer` for the new report
- Tab badge showing count of unactioned incoming orders
- **Default tab logic:** if there are any unconverted order leads, default to "Incoming Orders" tab; otherwise default to "pending_review" as before
- The existing `CreateDDReportDialog` stays for internal/manual reports not tied to a client order

**Note on `user_id`:** The `dd_reports` table requires `user_id NOT NULL`. Since we're creating reports on behalf of clients who may or may not have a registered account, the `user_id` will be set to the admin's own user ID when using "Start Report". The client sees the report via their `client_email` match if we add that query — or alternatively we query `dd_reports` for both `user_id` and `client_email` on the dashboard. This is a pragmatic approach until a full account-linking flow is built.

---

### 1C. Dashboard.tsx — 4-Stage Visual Progress Bar

**What changes in the Pending Orders section:**

Replace the plain `Clock + "Being prepared"` text with a proper 4-stage stepper for each pending order:

```
[●]────[●]────[○]────[○]
Order     In        Under      Ready
Received  Progress  Review     to Download
```

Stage mapping for orders still in `order_leads (converted=false)`:
- Stage 1 complete, Stage 2 active = "In Progress / Being set up"

Stage mapping once a `dd_reports` row exists (queried by `client_email`):
- `generating` → Stage 2 active
- `pending_review` → Stage 3 active  
- `approved` → Stage 4 complete

**Implementation:** The `ReportStatusTimeline` component already has the correct 4-step structure. We reuse it in the Pending Orders cards. We also add a secondary query on the dashboard: fetch `dd_reports WHERE client_email = userEmail` to catch reports the admin created from the order lead (since those are under the admin's `user_id`, not the client's). This gives the progress bar enough data to advance past Stage 2 even for clients who don't have an account yet.

**Also in Dashboard.tsx:**
- Update label `"Under Review by GLE Team"` → `"Under Review"` in `CLIENT_STATUS_LABELS`
- Add "Help Center" nav button for admins (alongside existing DD Reports and Admin buttons)

---

## Cluster 2: Help Center (`/help`)

### 2A. Database Migration — New tables

```sql
-- Roadmap items table (admin-only)
CREATE TABLE public.roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text DEFAULT 'general' CHECK (category IN ('billing','projects','integrations','operations','general')),
  priority text DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  status text DEFAULT 'backlog' CHECK (status IN ('backlog','in_progress','shipped')),
  ai_tested boolean DEFAULT false,
  ai_evidence text,
  ai_challenges jsonb,
  ai_duplicate_warning text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on roadmap_items"
ON public.roadmap_items FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- AI usage logs table (admin-only read, service role write)
CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  feature text NOT NULL,
  model text NOT NULL,
  prompt_tokens int DEFAULT 0,
  completion_tokens int DEFAULT 0,
  total_tokens int DEFAULT 0,
  estimated_cost_usd numeric(10,6) DEFAULT 0,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai_usage_logs"
ON public.ai_usage_logs FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```

Note: `ai_usage_logs` is written to by edge functions using the **service role key**, which bypasses RLS — so no INSERT policy is needed. Admins read it via the SELECT policy.

---

### 2B. New Edge Function: `analyze-telemetry`

`supabase/functions/analyze-telemetry/index.ts`

Handles two modes, called from the Help Center frontend:

**Mode: `"idea"`**
- Accepts: `{ mode: "idea", raw_idea: string, existing_titles?: string[] }`
- Calls Lovable AI (`google/gemini-3-flash-preview`) with tool calling to extract structured JSON
- System prompt: *"You are a senior product analyst. Stress-test this product idea: surface risks, flag duplicates against existing roadmap items, score priority (high/medium/low), and return structured JSON: { title, description, category, priority, evidence, duplicate_warning, challenges: [{problem, solution}] }. category must be one of: billing, projects, integrations, operations, general."*
- Uses tool calling (`suggest_analysis` function) to extract structured output — no raw JSON parsing
- After successful AI call: logs to `ai_usage_logs` via service role with `feature: "stress_test"`
- Returns the parsed result to the client

**Mode: `"telemetry"`**
- Accepts: `{ mode: "telemetry" }`
- Queries `order_leads` via service role: counts by `step_reached`, `rush_requested`, `converted`, date ranges
- Builds a summary string and calls Lovable AI to identify up to 5 UX friction patterns
- After successful AI call: logs to `ai_usage_logs` with `feature: "telemetry_analysis"`
- Returns up to 5 gap suggestions as `{ title, description, priority }[]`

Add to `supabase/config.toml`:
```toml
[functions.analyze-telemetry]
verify_jwt = false
```

---

### 2C. Update `generate-dd-report` — Log AI usage

After the two existing AI calls (line-item notes + AI analysis) at line ~637, add a usage log entry using the service role client:

```typescript
// After both AI calls succeed, log combined usage
const usage = {
  feature: "report_generation",
  model: "google/gemini-3-flash-preview",
  prompt_tokens: 0,     // approximate — Lovable gateway doesn't always return usage
  completion_tokens: 0,
  total_tokens: 2000,   // conservative estimate per report
  estimated_cost_usd: 0.000300,
  metadata: { reportId, address }
};
await supabase.from('ai_usage_logs').insert(usage);
```

Note: The Lovable AI gateway may not return token counts consistently. We log an estimated value so the dashboard shows activity. If token counts ARE returned in `data.usage`, we use those instead.

---

### 2D. New Page: `src/pages/Help.tsx`

Admin-only. Redirects non-admins to `/dashboard`. Structure:

```
/help
  ├── Tab 1: Product Roadmap
  ├── Tab 2: Feature Requests  
  ├── Tab 3: AI Usage
  └── (No Clarity tab — deferred)
```

**Tab 1: Product Roadmap**

Three-column Kanban layout: Backlog | In Progress | Shipped

Each roadmap card:
- Title (bold), description (muted, 2 lines max)
- Category badge (color coded: billing=blue, integrations=purple, operations=orange, general=gray)
- Priority badge (high=red, medium=amber, low=green)
- `⚡ AI tested` badge (shows if `ai_tested = true`)
- **[Run AI Test]** button → calls `analyze-telemetry` with `mode: "idea"` and the item's title + description
- AI result expands inline below the card:
  - Evidence text ("Why it matters: ...")
  - Challenges list: `Problem → Solution` (each as a row)
  - Duplicate warning (if `duplicate_warning` is non-empty, show as amber alert)
  - Auto-fills the priority and category on the card on save
- Move buttons: `→ In Progress` / `→ Shipped` / `← Back` depending on current column
- Delete button (with confirm)

Add item form (at bottom of Backlog column):
- Title input, Description textarea
- Priority select (High/Medium/Low), Category select
- **[Run AI Test ⚡]** button — can test before saving
- **[Save to Roadmap]** button — saves to `roadmap_items`, adds to the Backlog column

**Tab 2: Feature Requests**

Two-panel layout:

*Left panel — AI Idea Intake:*
- `<h3>Got an idea?</h3>`
- Textarea: "Describe your feature idea..."
- `[Analyze with AI ⚡]` button
- Loading spinner while analyzing

*Right panel — Result card (shown after analysis):*
- Refined title
- "Why it matters" (evidence)
- Priority badge
- Category badge
- Challenges list: `problem → solution` format
- Duplicate warning (if present, amber callout)
- `[Add to Roadmap]` button → inserts into `roadmap_items` with all the AI-filled fields, `ai_tested: true`

*Below both panels — Telemetry Scan:*
- Section heading: "UX Funnel Analysis"
- Short description: "Scan order submission data to find where clients drop off or struggle."
- `[🔍 Scan for UX Gaps]` button → calls `analyze-telemetry` with `mode: "telemetry"`
- Results rendered as up to 5 suggestion cards, each with title, description, priority badge

**Tab 3: AI Usage Dashboard**

Date range selector at top: `[Last 7 days] [Last 30 days] [Last 90 days]`

KPI Cards row (4 cards):
- **Total Requests** — count of `ai_usage_logs` rows in range
- **Words Processed** — sum of `total_tokens` × 0.75, formatted as "42,000 words"
- **Estimated Cost** — sum of `estimated_cost_usd`, formatted as "$0.84"
- **Features Using AI** — count of distinct `feature` values

Bar chart (recharts BarChart) — **Requests by Feature**:
- X-axis: friendly feature names
- Feature name map: `stress_test` → "Roadmap Stress Test", `report_generation` → "Report Generation", `telemetry_analysis` → "Behavior Analysis"

Bar chart — **Daily AI Activity**:
- X-axis: dates in range
- Y-axis: request count per day
- Grouped by `created_at::date`

Progress bars — **AI Models Used**:
- Model name map: `google/gemini-3-flash-preview` → "Gemini Flash (fast, efficient)", `google/gemini-2.5-pro` → "Gemini Pro (most powerful)"
- Each bar shows % of total requests for that model

Cost breakdown table:
| Feature | Requests | Words Processed | Est. Cost |
|---------|----------|-----------------|-----------|
| Report Generation | 12 | 18,000 | $0.54 |

Footnote: "Words processed is an estimate (tokens × 0.75). For actual billing, see [Lovable Billing](https://lovable.dev/pricing)."

All tooltips on charts use plain language — "words" not "tokens", "cost estimate" not "token cost."

---

### 2E. App.tsx — Add `/help` route

```tsx
import Help from "./pages/Help";
// ...
<Route path="/help" element={<Help />} />
```

---

### 2F. Admin.tsx + Dashboard.tsx — Add Help Center nav button

In the admin nav area of both pages, add:
```tsx
<Button variant="ghost" size="sm" onClick={() => navigate('/help')}>
  <BookOpen className="h-4 w-4 mr-1" /> Help Center
</Button>
```

This button shows only when `isAdmin` is true (already gated the same way as the DD Reports and Admin buttons).

---

## Implementation Order

1. **DB migrations** — `order_lead_id` column + order_leads UPDATE RLS + `roadmap_items` table + `ai_usage_logs` table
2. **`analyze-telemetry` edge function** — deploy new function
3. **Update `generate-dd-report`** — add AI usage logging
4. **`DDReports.tsx`** — Incoming Orders tab + Start Report one-click fulfillment
5. **`Dashboard.tsx`** — 4-stage progress bar + "Under Review" label fix + Help Center nav button
6. **`Help.tsx`** — new page with all 3 tabs (Roadmap, Feature Requests, AI Usage)
7. **`App.tsx`** — add `/help` route
8. **`Admin.tsx`** — add Help Center nav button

---

## Files Summary

| File | Action |
|------|--------|
| DB migration | Create 4 schema changes (order_lead_id, order_leads UPDATE RLS, roadmap_items, ai_usage_logs) |
| `supabase/functions/analyze-telemetry/index.ts` | Create new |
| `supabase/config.toml` | Add analyze-telemetry entry |
| `supabase/functions/generate-dd-report/index.ts` | Add AI usage logging |
| `src/pages/DDReports.tsx` | Add Incoming Orders tab + Start Report |
| `src/pages/Dashboard.tsx` | Progress bar + label fix + Help nav button |
| `src/pages/Help.tsx` | Create new (3 tabs) |
| `src/App.tsx` | Add /help route |
| `src/pages/Admin.tsx` | Add Help Center nav button |

---

## What Is NOT in This Plan

- Microsoft Clarity script (deferred — no tag ID yet)
- Email notifications (separate sprint)
- Stripe payment wiring (separate sprint)
- White-label, batch screening, property monitoring (roadmap — stress-test these in the new Help Center after it's built)
- The previously declined/deferred ideas from the 15-item list
