# BinCheckNYC — Test plan

A focused, run-it-yourself checklist covering the marketing flywheel (PRs #12–#15), security hardening (PR #16), admin leads (PR #17), Resend wiring (PR #18), and the ACRIS scaffold (PR #19).

Owner: erussell25@gmail.com · Last updated: 2026-06-13

---

## 0. Pre-flight (do this first)

- [ ] Pull `main` and run `npm run build` — must finish clean
- [ ] Supabase → Functions → Secrets — `RESEND_API_KEY` is set
  - URL: https://supabase.com/dashboard/project/ohoutpkgkxfueyllgfvv/functions/secrets
- [ ] Supabase → Functions — every function under `supabase/functions/*` is deployed (latest commit hash matches)
- [ ] Resend → Domains → `mail.binchecknyc.com` is **Verified** (DKIM, MX, SPF all green)
- [ ] Hit **Publish** in Lovable so production reflects merged `main`

---

## 1. SEO + programmatic landers (PR #12, PR #14)

- [ ] `/robots.txt` returns 200 and points to `https://binchecknyc.com/sitemap.xml`
- [ ] `/sitemap.xml` returns 200, lists every agency lander, every borough lander, and the core marketing routes
- [ ] Open 3 agency landers from sitemap (e.g. `/architect`, `/expediter`, `/owner`). Each one:
  - [ ] Has unique `<title>` and `<meta name="description">`
  - [ ] Renders OG image preview when pasted into a Slack/iMessage compose box (use a private DM to test)
  - [ ] No 404 on linked CTAs
- [ ] Submit `https://binchecknyc.com/sitemap.xml` to Google Search Console (deferred — waiting on LLC; this is the user step)

## 2. Lead capture (PR #13)

For each of `intent = sample`, `pricing`, `enterprise`:

- [ ] Open the relevant CTA on the marketing site → dialog opens
- [ ] Submit with a fake throwaway email (`+test1` style)
- [ ] Dialog flips to the success state
- [ ] In Supabase Studio → `marketing_leads` — row appears with correct intent, UTM (if any), referrer, user_agent
- [ ] Try submitting the same email 6× in a row — 6th submission fails with rate-limit error
- [ ] Plausible dashboard records both `lead_opened` and `lead_submitted` with the correct `intent` prop

## 3. Plausible analytics (PR #15)

- [ ] `index.html` has the Plausible script tag pointed at `binchecknyc.com`
- [ ] Plausible dashboard shows pageviews within ~30 seconds of you reloading the homepage in a fresh window
- [ ] These custom events fire when you trigger them: `cta_clicked`, `lander_cta_clicked`, `lead_opened`, `lead_submitted`, `order_started`, `order_placed`

## 4. Security hardening (PR #16)

### 4.1 RLS / data access
- [ ] As an unauthenticated browser session, `select * from order_leads` via the Supabase JS client returns 0 rows (was previously open to everyone)
- [ ] As a non-admin authenticated user, calling `get_users_with_email` returns 403/permission denied
- [ ] As an admin, `get_users_with_email` works as before
- [ ] `cleanup_rate_limit_buckets` errors for a non-admin user

### 4.2 Storage
- [ ] `bug-attachments` bucket → Storage settings → **Public** is OFF
- [ ] In a bug report detail view, attachments render via signed URLs (URLs include `?token=...` and expire after ~7 days)
- [ ] Old bug attachments uploaded before PR #16 may not render (legacy path) — admin can move them via Supabase Studio if needed

### 4.3 Open-redirect guard
- [ ] `GET /functions/v1/track-cta-click?to=https://evil.example.com&...` returns the host-allowlist error and does NOT redirect
- [ ] `GET /functions/v1/track-cta-click?to=https://www.binchecknyc.com/pricing&...` still redirects correctly
- [ ] Same with `lovable.app` and `lovable.dev` (allow-listed)

### 4.4 send-transactional-email auth gate
- [ ] Hit the endpoint with just the anon key in `Authorization` — returns 401 "User authentication required"
- [ ] Hit it with a signed-in user JWT — passes (responds 200 with `queued: true`)
- [ ] Hit it with the service-role key (server-side) — passes

## 5. Admin /admin/leads (PR #17)

- [ ] As admin, `/admin/leads` loads
- [ ] As sales role, `/admin/leads` loads
- [ ] As a regular signed-in user, `/admin/leads` redirects or returns access denied
- [ ] Marketing-leads tab:
  - [ ] Status filter (new / contacted / qualified / converted / rejected / spam) narrows results
  - [ ] Intent filter narrows results
  - [ ] Search field matches on email / name / company
  - [ ] Detail dialog shows UTM source/medium/campaign + referrer + user_agent
  - [ ] Changing status + saving persists and refreshes the row
  - [ ] Adding a note persists
- [ ] Abandoned-orders tab:
  - [ ] Lists `order_leads` rows where `converted = false`
  - [ ] Converted leads have a "View report" link that opens the linked dd_report

## 6. Email pipeline — Resend (PR #18)

### 6.1 Smoke test (you, as a signed-in user)
- [ ] In an Edge Function logs window, invoke `send-transactional-email` with a known-good template name and your real email:
  ```bash
  curl -X POST 'https://ohoutpkgkxfueyllgfvv.supabase.co/functions/v1/send-transactional-email' \
    -H 'Authorization: Bearer <your-user-jwt>' \
    -H 'Content-Type: application/json' \
    -d '{"templateName":"marketing-lead-confirmation","recipientEmail":"you@example.com","templateData":{"firstName":"Manny","intent":"pricing"}}'
  ```
- [ ] You receive the email from `BinCheckNYC <hello@mail.binchecknyc.com>` within ~30 seconds (the queue runs every 5s)
- [ ] In Supabase Studio → `email_send_log` — one row `status=pending` then a follow-up `status=sent`

### 6.2 Marketing-lead confirmation (end-to-end)
- [ ] Submit the lead-capture dialog with each intent (`sample`, `pricing`, `enterprise`, leave blank for `general`)
- [ ] In a real inbox, you receive a copy of the matching template (subject + CTA + headline vary by intent)
- [ ] `email_send_log` records `template_name = marketing-lead-confirmation` with `status = sent`

### 6.3 Order confirmation
- [ ] Place a fake test order (your own LLC test page, or via Supabase Studio insert into `dd_reports` directly)
- [ ] You receive the order-confirmation email with property, plan, price, invoice-on-delivery note
- [ ] `email_send_log` records `template_name = order-confirmation` with `status = sent`

### 6.4 Negative paths
- [ ] Add your email to `suppressed_emails` and re-submit a lead — the dispatcher logs `status = suppressed`, no email arrives
- [ ] Temporarily set `RESEND_API_KEY` to garbage — dispatcher logs `status = failed` then `status = dlq` after 5 retries
- [ ] Restore `RESEND_API_KEY`

## 7. ACRIS scaffold (PR #19)

- [ ] In Supabase Studio → `acris_cache` table exists, empty
- [ ] Invoke `fetch-acris-bbl` with a known BBL (e.g. 350 Fifth Ave Manhattan = `1008350017`):
  ```bash
  curl -X POST 'https://ohoutpkgkxfueyllgfvv.supabase.co/functions/v1/fetch-acris-bbl' \
    -H 'Authorization: Bearer <your-user-jwt>' \
    -H 'Content-Type: application/json' \
    -d '{"bbl":"1008350017"}'
  ```
- [ ] First call returns `source: "live"` and writes a row to `acris_cache`
- [ ] Second call within 7 days returns `source: "cache"` and increments `hit_count`
- [ ] Passing `{"bbl":"1008350017","force_refresh":true}` returns `source: "live"` and re-writes the row
- [ ] Anon call (no auth header) returns 401
- [ ] Bad BBL (`{"bbl":"123"}`) returns 400 "BBL must be 10 digits"

## 8. Order placement smoke test (full path)

- [ ] Sign in to a test account
- [ ] Visit `/order?address=350+5th+Ave+New+York`
- [ ] Fill the form, agree to invoice-on-delivery, submit
- [ ] `dd_reports` row inserted with `payment_status='invoiced'` and `status='generating'`
- [ ] `order_placed` Plausible event fires
- [ ] Order-confirmation email arrives
- [ ] `generate-dd-report` runs (check function logs) — produces a PDF
- [ ] Report-ready email arrives once generation completes

## 9. Deferred / still on you

These are intentionally NOT in this checklist because they depend on external setup:

- [ ] **Stripe Checkout** — waiting on LLC, then wire `payment_status='paid'` flow
- [ ] **Google Search Console + sitemap submit** — waiting on entity
- [ ] **Plausible dashboard signup** — sign in at plausible.io with your BinCheckNYC site
- [ ] **ACRIS subscription paperwork** — 212-487-6300, registerinfo@finance.nyc.gov (unlocks direct feed; current code stays valuable as cache)
- [ ] **Beacon concierge spec** — re-spec when ready

---

If anything in sections 1–8 fails, open an issue on the repo and tag the relevant PR so the regression is obvious.
