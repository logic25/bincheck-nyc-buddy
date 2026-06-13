## Recommendations (for your "not sure" answers)

**Audience** — Recommend **"Real estate professionals"**: attorneys, investors, brokers, title, developers. Wider than "attorney-ready" but still B2B (matches your buyer; avoids retail-shopper expectations on a $199 product).

**Disclaimer placement** — Recommend **3 places, each scoped**:
1. **Landing footer** — one short line: *"Reports are compiled from public NYC agency records. Verify with source agencies before reliance."* (current full paragraph is too heavy for the marketing page).
2. **`/order` above the pay button** — full paragraph (the legally important moment is right before payment).
3. **Inside every delivered PDF** — full paragraph in the cover/footer (already there in `DDReportPrintView`).

Confirm or override either of these in the plan.

---

## Changes

### 1. Pricing — restore original tiers
From `mem://features/monetization`:
- **One-Time Report — $199** (flat, no rush fee)
- **Rush add-on — +$75** (toggle on the order page; not its own tier)
- **Professional — $599/mo, 5 reports** ($120/report effective)
- **Enterprise — Custom** (unchanged)

Update `src/pages/Index.tsx` pricing cards + the `Order a Report — $499` button in the comparison section + `/order` plan cards + FAQ "Professional plan ($2,499/mo)" mention. Comparison row "Per-report price" → `$199 flat` (theirs `$800–$1,500+` stays).

### 2. Kill the bad lines
- **Remove** `"Cheaper than 30 minutes of paralegal time. Faster than any manual search."` subhead under "Simple, transparent pricing." Replace with: *"One price. No subscription required. Volume plans for firms running 5+ reports a month."*
- **Remove** `"If we can't deliver a complete report, you don't pay"` chip from the pricing trust row and from the FAQ "How do payments work?" answer. Reason: with upfront Stripe checkout (next item) it's contradictory.
- **Rewrite** FAQ "How is this different from running my own ACRIS / BIS / ECB searches?" to drop the paralegal-cost framing — replace with: *"Eight agency portals, one PDF, in 24–48 hours, with analyst-reviewed notes on every line item. We do the pulling, cross-referencing, and formatting so your team can read findings instead of assembling them."*
- **Rewrite** FAQ "How do payments work?" → *"Checkout takes a card upfront via Stripe. If we can't complete your report for any reason, we refund in full. Invoicing (Net 7, ACH/wire) is available on Professional and Enterprise plans."*

### 3. Reframe "Attorney-ready"
- Comparison row `Attorney-ready PDF format` → `Closing-file PDF format`.
- Hero subhead and any other "attorney-ready" instances → `closing-ready` or `diligence-ready`.
- Enterprise card subtitle `"For attorneys, title, brokers, and investors"` → keep (already broad).

### 4. Reframe "Why BinCheckNYC" section
Current heading *"Built for the buy side"* + italic *"what am I actually buying?"* reads cute, not premium. Replace section intro with:

> **Badge:** How we compare
> **H2:** Eight agencies. One PDF. 24–48 hours.
> **Subhead:** Most NYC compliance vendors sell portfolio monitoring to building owners. BinCheckNYC is built for the team running diligence on a property they don't own yet — and needs answers before a closing date.

Comparison table itself stays (it's the strongest section on the page).

### 5. Delivery after payment — Both (auto-download + email)
On Stripe success:
- The `/order` success page auto-downloads the PDF (blob URL) **and** shows it inline in-app, **and**
- A `report-ready` transactional email goes out via the existing `send-transactional-email` function with a PDF attachment link.

Implementation: invoke `send-transactional-email` with `templateName: "report-ready"` from the report-completion handler (server-side). Add `?download=1` to the success-page report viewer so the existing html2pdf export auto-fires on mount.

*(Server pipeline is a follow-up implementation; this plan only wires the trigger + UI. Stripe is not in scope per the prior plan, but the success-page behavior is added behind a flag so it lights up the moment Stripe lands.)*

### 6. SSL — yes, factually correct, but downgrade the chip
Lovable Cloud + custom domain serve over HTTPS with TLS 1.2/1.3 (Cloudflare-managed certs). Keeping the "SSL encrypted" chip is honest. **Move it from the pricing row to the `/order` checkout footer** alongside the disclaimer — that's where buyers actually want reassurance. Replace the pricing chips with one line: *"Volume discounts for firms · Custom invoicing on Professional+."*

### 7. Disclaimer placement (see Recommendations)
- **Landing footer** (`Index.tsx` line 635): collapse to one sentence.
- **`/order`**: full paragraph above pay button + `SSL encrypted` chip.
- **PDF**: already correct.

### 8. FAQ aesthetic fix
Current accordion uses default shadcn styling on a stark white background and feels disconnected from the rest of the navy/2px-divider system. Tighten to match:
- Wrap each `AccordionItem` in `border-b border-border` (no rounded card), remove default shadcn padding.
- Question (`AccordionTrigger`): `text-base font-display font-semibold text-foreground py-5`.
- Answer (`AccordionContent`): `text-sm text-muted-foreground leading-relaxed pb-5 max-w-prose`.
- Section background: `bg-card/20` (matches the comparison section above) instead of plain white.
- Section heading: keep *"Questions deal teams ask us"* — that one's good.

---

## Files touched
`src/pages/Index.tsx`, `src/pages/Order.tsx`, `src/components/dd-reports/DDReportViewer.tsx` (auto-download flag), `supabase/functions/send-report-email/index.ts` (wire trigger; template already exists).

## Out of scope
- Stripe checkout wiring itself (separate PR — but copy and UI are written to match what Stripe will land).
- Touching the PDF disclaimer text (already correct).
- Building the auto-generate-report-from-address sample pipeline (deferred from prior turn; sample CTA stays as mailto).
