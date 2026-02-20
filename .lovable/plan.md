
# Two Fixes: AI Inline Notes Prompt + Quick Search UX

## Problem 1: AI Inline Notes Prompt Is Too Weak

### What the current prompt actually says (lines 376-388 of edge function):

```
You are reviewing NYC DOB/ECB/HPD records for [ADDRESS].
[concern or "No specific customer concern provided. Write general impact notes."]

For EACH item below, write a brief note (under 15 words) assessing its relevance/impact.
Format: "[brief what it is]; [impact assessment relative to concern]"
Examples:
- "related to elevator; no impact on unit 10B"
- "exterior facade repairs floors 1-ROF; no impact on unit 10B"

Items to review: [JSON]
```

### Problems identified:

1. **The customer concern IS passed in** — the variable `concernText` includes it — but the instruction says "assessing its relevance/impact" without explicitly telling the AI to compare against that concern. The AI treats it as context but doesn't consistently use it as a filter.

2. **"Under 15 words" is too aggressive.** It produces clipped outputs like "elevator-related; no impact" with zero professional value. An attorney reading this has no useful information.

3. **No severity guidance at all.** The AI has no instruction for how to treat:
   - An ECB violation with a $4,000 balance due vs. one that's dismissed
   - A stop-work order vs. a routine LAA permit
   - An HPD Class C (immediately hazardous) vs. Class A (non-hazardous)
   - An OATH hearing with an open compliance status vs. paid

4. **The system role is too casual**: "You generate brief per-item notes" — no professional framing.

5. **Agency list is hardcoded to DOB/ECB/HPD in the opening line**, even though we now fetch FDNY, DSNY, DOT, LPC, DOF violations too.

6. **No instruction on what "status" means** — `partial permit status` is meaningless without telling the AI what partial means (permit issued for part of a job, not the full scope — which can indicate incomplete work or stalled project).

---

### The Improved Prompt (complete replacement for lines 376-388):

```typescript
const concernInstruction = customerConcern
  ? `The client's specific question is: "${customerConcern}"
Each note MUST assess whether this item is relevant to that question. 
If the item clearly cannot affect the client's concern (e.g., it's on a different floor, different system, or already resolved), say so briefly.
If it IS relevant or potentially relevant, explain the specific risk or implication.`
  : `No specific concern was provided. Write a general professional impact note for each item focusing on open issues, outstanding balances, and unresolved compliance status.`;

const prompt = `You are a licensed NYC real estate compliance analyst writing transaction notes for a due diligence report.

Property: ${address}
${concernInstruction}

For EACH item below, write one professional note of 1-2 sentences (maximum 25 words) that:
1. Identifies what the item is (agency, type, location such as floor/apt if present in the data)
2. States whether it is resolved, open, or pending — using the status field
3. Assesses relevance and impact relative to the client's concern (or general risk if no concern)

SEVERITY GUIDANCE — use these rules to frame your notes:
- ECB violation with penalty_amount > 0 and status=open: flag as financial exposure, note balance
- HPD Class C violation (immediately hazardous): always flag as high priority regardless of concern
- HPD Class B violation (hazardous): flag if open
- Stop-work order or vacate order: always flag as critical
- FDNY or DSNY violation with open hearing_status: flag as requiring follow-up
- Permit application with status "PARTIAL": note that work was partially permitted — indicates incomplete or staged work; assess if relevant to concern
- Permit application with status "APPROVED" or "COMPLETED": generally resolved, note briefly
- Dismissed, Resolved, Paid, Written Off, Closed items: note as resolved, no further action required

Use [ACTION REQUIRED] at the start of any note where there is an outstanding balance, open enforcement hearing, or unresolved compliance issue that requires attorney attention.

Items to review:
${JSON.stringify(allItems, null, 2)}`;
```

And update the system role to:
```typescript
{ role: "system", content: "You are a licensed NYC real estate compliance analyst writing professional due diligence transaction notes. Be precise, professional, and attorney-ready. Return structured JSON via the tool call." }
```

---

## Problem 2: Quick Search Tab UX Is Broken

### What currently happens:
- User is on `/dashboard`, "Quick Searches" tab
- They see a list of past saved reports (BIN lookup cards) — that's fine
- When there are NO saved reports, the empty state shows a `Button` that calls `navigate("/")` — this navigates away from the dashboard to the home page search
- This is the broken interaction — the user expected an inline search, not a page redirect

### Root cause (line 374 of Dashboard.tsx):
```tsx
<Button className="mt-4" onClick={() => navigate("/")}>Search Properties</Button>
```

### What it should be:
The "Quick Search" tab should have an inline search box at the top — identical in behavior to the search on the home page (the `Index.tsx` search already has the autocomplete/geosearch logic). The user types an address, picks a suggestion, clicks Search, and it navigates to `/report?address=...` — exactly what `Index.tsx` does.

The saved reports list below the search box remains, showing past searches. When empty, there's no more awkward "go to another page" button — the search IS right there on the tab.

This is a **self-contained UX pattern** — the search logic from `Index.tsx` (fetch suggestions from `geosearch.planninglabs.nyc`, debounce, keyboard navigation, autocomplete dropdown) gets extracted into a reusable component or inlined into the Quick Search tab.

---

## Files to Change

### 1. `supabase/functions/generate-dd-report/index.ts`
- Replace the `generateLineItemNotes` prompt (lines 350-388) with the improved version above
- Update the system role message (line 397)
- Fix the agency reference from hardcoded "DOB/ECB/HPD" to generic "NYC agency"

### 2. `src/pages/Dashboard.tsx`
- Add inline address search state variables: `searchQuery`, `searchSuggestions`, `showSuggestions`, debounce ref
- Add `fetchSearchSuggestions` function (identical logic to Index.tsx)
- Replace the Quick Search tab content: add a search form at the TOP of the tab (above the saved reports list) with the same autocomplete dropdown as the home page
- Replace the empty state button (`navigate("/")`) with the inline search — now the search box IS there so the empty state just says "No past searches yet"
- Remove the "Refresh" button from the top of the tab (it's a minor clutter item — searches update on tab switch)
- On submit, navigate to `/report?address=...` exactly as Index.tsx does

---

## What Does NOT Change
- The actual data fetching for saved reports
- The DD Reports tab and its cards
- All admin routing and role checks
- The edge function's AI analysis prompt (separate from line-item notes)
- All other pages

---

## Technical Note on Search Reuse

The geosearch autocomplete logic in `Index.tsx` uses:
- `fetchSuggestions` → `geosearch.planninglabs.nyc/v2/autocomplete`
- `handleInputChange` with 200ms debounce
- Keyboard navigation (ArrowUp/Down, Enter, Escape)
- Click-outside to close

This exact pattern gets duplicated into the Dashboard Quick Search tab. If this pattern is used a third time, it should be extracted into a shared `useAddressSearch` hook — but for now, keeping it in the two page files is fine and avoids premature abstraction.
