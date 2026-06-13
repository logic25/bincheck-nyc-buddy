Three small landing-page fixes based on your questions.

## 1. FAQ — drop the sample question
Remove: *"Can I see a sample?"* from the FAQ accordion in `src/pages/Index.tsx`. Leaves 3 questions (What's in it, How fast, How do payments work). Cleaner, and the sample CTA already lives in the deliverable section above.

## 2. Hero copy — bring back the punchy tagline
Your original February hero was:

> **Due diligence, delivered.**
> Transaction-ready NYC property risk reports for attorneys, investors, and deal teams.

I agree it's stronger than the current *"Every NYC violation tied to a BIN, in one report."* The old line is 3 words, outcome-focused, and defines the category. The current line is accurate but reads like a feature description — it explains *how*, not *why*.

**Proposed change:**
- H1 → **"Due diligence, delivered."**
- Subhead → *"Transaction-ready NYC property compliance reports for attorneys, investors, and deal teams."*
- Keep the descriptive mechanism (*"Every NYC violation tied to a BIN..."*) as the **eyebrow badge** or the first paragraph under the H1 — it still belongs on the page, just not as the headline.

## 3. Nav bar — two broken things
**Unauthenticated:** *Coverage* links to `#coverage`, but no section on the page has `id="coverage"`. The "What's Included" section lacks an anchor, so that link is dead.

**Authenticated:** Only *Home* (→ `/dashboard`), *Settings*, *Sign Out*. Very bare. Most users expect an explicit *Reports* or *Dashboard* link.

**Proposed fixes:**
- Add `id="coverage"` to the "What's Included" section so the anchor works.
- Rename authenticated *Home* → *Dashboard* (clearer CTA, same route).
- Add a *Reports* link (→ `/dd-reports`) between Dashboard and Settings.

## Files changed
- `src/pages/Index.tsx` — FAQ edit, hero copy swap, add `id="coverage"`, nav tweaks.

## Out of scope
- No pricing, auth, or report logic changes. Pure copy + anchors.