# Fix: login flicker + confusing "invalid credentials" for Google accounts

## What's actually wrong

**Issue A — Flicker after Google login (the "two things" you saw)**
`src/pages/Auth.tsx` registers `onAuthStateChange` AND separately calls `getSession().then(...)`. When you return from Google OAuth, both fire with a valid session and both call `navigate("/dashboard")`. Dashboard mounts, then immediately re-mounts. The session replay shows the dashboard nav + report list rendering twice within ~1 second — that's the glitch.

**Issue B — Password sign-in fails for your email**
Your user record (`erussell25@gmail.com`) was created through Google OAuth. Google-created accounts have **no password set**, so `signInWithPassword` correctly returns `invalid_credentials`. There is no bug to fix on the backend — but the UI gives no hint about what's happening, so it feels broken.

## Changes

### 1. `src/pages/Auth.tsx` — stop the double-navigate
- Remove the standalone `getSession().then(navigate)` block.
- Keep only `onAuthStateChange`, and inside it gate on `event === "SIGNED_IN"` or an initial session check that runs **once** and only navigates if the listener hasn't already.
- Use a `hasNavigated` ref so even if both fire, `navigate` runs at most once.

### 2. `src/pages/Auth.tsx` — better error for OAuth-only accounts
After `signInWithPassword` returns `invalid_credentials`, do a lightweight follow-up: call the existing edge auth context (or just inspect the error) and show a more useful toast:

> "This email is registered with Google. Sign in with Google, or use **Forgot password** to set a password."

We can't reliably detect "user exists but has no password" from the client without a server call (Supabase intentionally returns the same error to prevent enumeration). Two acceptable options:

- **Option A (recommended, no new backend):** On `invalid_credentials`, show a toast with both hints: "Wrong password — or this email may be registered with Google. Try Google sign-in or reset your password." Honest, no enumeration risk, solves the confusion.
- **Option B (small edge function):** New `check-auth-method` function that takes an email, looks up `auth.users.identities`, and returns `{ hasPassword, providers: ["google"] }`. Frontend then shows a precise message. Slight info leak (confirms account existence) but minor.

Recommend Option A for now; we can add the edge function later if support tickets keep coming in.

### 3. `src/pages/Dashboard.tsx` — same double-fire pattern (preventive)
Quick audit of Dashboard's auth-check `useEffect` (lines ~78+) — apply the same `hasNavigated` ref pattern if it also calls both `getSession` and `onAuthStateChange`. Prevents a similar flicker when the session expires.

## Out of scope
- No changes to OAuth provider config, redirect URIs, or `src/integrations/lovable/index.ts` (auto-generated).
- No changes to the sign-up / invite-code flow.
- Not touching the landing page copy from the earlier discussion — separate task.

## Files touched
- `src/pages/Auth.tsx` (navigation guard + error message)
- `src/pages/Dashboard.tsx` (navigation guard only, if pattern matches)

## How we'll verify
1. Log out → click "Continue with Google" → land on `/dashboard` with no visible flash/double-render.
2. Log out → enter `erussell25@gmail.com` + any password → see the new "may be registered with Google" toast.
3. Click "Forgot password" → reset → confirm password sign-in then works alongside Google.
