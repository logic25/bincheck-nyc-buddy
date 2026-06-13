## Public nav update

### Changes
1. **Update public nav labels** in `src/pages/Index.tsx` (lines 173-179):
   - `Coverage` → `What's included` (href stays `#coverage`)
   - Add `How it works` (href `#how-it-works`) between `Sample` and `Pricing`
   - `Log in` → `Sign in`
   - `Order a report` → `Order`

2. **Add `id="how-it-works"`** to the "How it works" `<section>` at line 388 so the new nav link has an anchor target.

### Why
Aligns the public nav with the actual section headings on the landing page and adds a missing anchor for the "How it works" step-by-step strip.

### Files changed
- `src/pages/Index.tsx` (public nav labels + section ID)