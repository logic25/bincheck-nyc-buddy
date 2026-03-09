

# Beta-Ready Hardening Plan

You have a solid audit. Since you're going to beta testers for workflow feedback (not commercial sale yet), here's what actually matters now vs. what can wait.

## What to fix for beta (minimal effort, high impact)

### 1. Global Error Boundary (already built but not wired)
You already have `src/components/ErrorBoundary.tsx`. It just needs to be wrapped around `<App />` in `main.tsx`. One line change.

### 2. Remove .env from Git tracking
Add `.env` to `.gitignore` (it's already there based on the file list). The real issue is if `.env` exists in Git history — this requires a `git filter-branch` or BFG Repo-Cleaner on your GitHub repo. Keys are publishable/anon so low actual risk, but worth cleaning up.

### 3. Silent failure fix (already done)
You just implemented the agency error tracking with `fetchJSON` returning `{ data, error }`. This addresses finding #1 under Error Handling and the "returns empty arrays on failure" concern.

### 4. Add Zod validation on NYC API responses
In `generate-dd-report/index.ts`, validate the shape of DOB/HPD/ECB/OATH responses before processing. This prevents corrupted data from making it into reports. ~3-5 hours of work across the edge functions.

### 5. Content Security Policy meta tag
Add a `<meta>` CSP tag to `index.html`. Quick win for security headers.

## What can wait until after beta feedback

| Item | Why it can wait |
|------|----------------|
| Stripe payments | Beta testers aren't paying yet |
| CI/CD pipeline | Manual deploys are fine for beta |
| Test suite | Important but won't block feedback collection |
| Sentry/error monitoring | Console logs are adequate for beta scale |
| Database-backed rate limiting | Beta testers won't be abusing endpoints |
| Report encryption at rest | Low risk during controlled beta |
| Dependency pinning | Low probability issue short-term |
| Structured logging | Not needed at beta volume |

## Implementation order

1. Wire ErrorBoundary in `main.tsx` (5 min)
2. CSP meta tag in `index.html` (15 min)
3. Zod schemas for NYC API responses in edge functions (3-5 hours)
4. Clean `.env` from Git history (GitHub side, outside Lovable)

Total: ~1 day of work to be beta-ready with the security basics covered.

