# BinCheckNYC Security & Secret Rotation

Last reviewed: 2026-06-12 (Phase 2 hardening).

This document is the source of truth for **what secrets we run with**, **who can rotate them**, and **how often**. If you change anything in production, log it in `/admin/audit` and update the "Last rotated" column below.

---

## Threat Model (one-paragraph version)

BinCheckNYC stores PII-light data (buyer email, property addresses, payment status) and produces high-trust DD reports that drive real-estate transactions worth millions. The realistic attack surface is:

1. **Stolen Supabase service-role key** → full DB takeover.
2. **Stolen LLM gateway key** → unbounded LLM spend until we notice.
3. **Stolen cron secret** → an attacker can manually trigger our scheduled jobs (timeout-stale-reports, accuracy-stats refresh). Limited blast radius but can be used to mask other actions in logs.
4. **Compromised user account with admin role** → can grant/revoke roles, see audit log, manage documents. Mitigated by `/admin/audit` (append-only, trigger-protected).
5. **Brute force of invite codes / DDoS of report generation** → mitigated by the Phase 2 `check_rate_limit` RPC wired into `validate-invite-code` (10/hr per IP) and `generate-dd-report` (5/hr per user).

We do **not** currently store payment card data (Stripe Checkout handles that) or HIPAA-protected health data. If we ever do, this doc needs a full overhaul.

---

## Secret Inventory

| Secret | Where it lives | Used by | Rotation cadence | Last rotated | Owner |
|---|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API; mirrored to Vercel env + Edge Function secrets | Every edge function; Vercel server actions | **Every 90 days**, or immediately on any suspicion | _set on first rotation_ | Manny |
| `SUPABASE_ANON_KEY` | Public — shipped to client | Browser → Supabase | Only if RLS policies regress; not on a cadence | n/a | Manny |
| `LOVABLE_API_KEY` (LLM gateway) | Edge Function secrets only | `generate-dd-report`, `generate-knowledge-entry`, `detect-knowledge-gaps`, `analyze-telemetry` | **Every 60 days** (LLM spend exposure) | _set on first rotation_ | Manny |
| `CRON_SECRET` | Edge Function secrets + Supabase pg_cron job config | `timeout-stale-reports`, `refresh-accuracy-stats`, `process-email-queue` | **Every 90 days** | 2026-06-12 (initial — `188f1edd…79aa5`) | Manny |
| `RESEND_API_KEY` | Edge Function secrets | `send-transactional-email`, `process-email-queue` | **Every 180 days** | _set on first rotation_ | Manny |
| `STRIPE_SECRET_KEY` (live) | Edge Function secrets — **not added yet, PR #10** | `create-checkout-session`, `stripe-webhook` | **Every 90 days** | n/a | Manny |
| `STRIPE_WEBHOOK_SIGNING_SECRET` | Edge Function secrets — added with PR #10 | `stripe-webhook` | Rotate alongside `STRIPE_SECRET_KEY` | n/a | Manny |
| GitHub deploy token / Vercel deploy hook | Vercel dashboard | CI | **Every 180 days** | _set on first rotation_ | Manny |

> **Convention**: any value with the substring `secret`, `key`, `token`, or `password` MUST live in Supabase Edge Function secrets or Vercel env vars. **Never** commit one to git, paste into a Slack channel, or include in a screenshot.

---

## Rotation Runbook

### Supabase service-role key

1. Supabase Dashboard → Settings → API → **Reset service_role key**. This invalidates the old key immediately.
2. Copy the new key.
3. Update **Vercel** env var `SUPABASE_SERVICE_ROLE_KEY` (Production + Preview).
4. Update **Supabase Edge Function secrets** (Dashboard → Edge Functions → Manage Secrets).
5. Redeploy Vercel (auto-triggers on env change) and redeploy any edge function that uses it (`supabase functions deploy <name>` for each).
6. Smoke test: `/admin/team` loads, `/admin/documents` loads, a fresh report generation completes.
7. Log it: insert into audit_log manually:
   ```sql
   select log_audit('secret.rotated', 'service_role_key', null,
     jsonb_build_object('reason', 'scheduled 90-day rotation'));
   ```

### LLM gateway key (`LOVABLE_API_KEY`)

1. Generate new key at the LLM gateway provider's dashboard.
2. Update Supabase Edge Function secret.
3. Redeploy `generate-dd-report` and any other consumer.
4. Smoke test by generating a report; watch logs for 401s.
5. Revoke the old key at the provider once smoke test passes.
6. Log: `log_audit('secret.rotated', 'llm_gateway_key', null, '{"reason":"scheduled"}'::jsonb);`

### Cron secret

1. Generate: `openssl rand -hex 32` (locally).
2. Update Supabase Edge Function secret `CRON_SECRET`.
3. Update each pg_cron job to send the new value in the `x-cron-secret` header:
   ```sql
   -- example
   select cron.alter_job(
     job_id := (select jobid from cron.job where jobname = 'timeout-stale-reports'),
     command := $$ select net.http_post(
       url := '<edge-fn-url>',
       headers := '{"x-cron-secret":"NEW_VALUE","Content-Type":"application/json"}'::jsonb
     ); $$
   );
   ```
4. Wait one cron cycle, confirm no 401s in logs.
5. Log it.

### On suspected compromise (any secret)

1. **Rotate immediately**, don't wait for cadence.
2. Pull the audit log for the suspicious window:
   ```sql
   select * from audit_log where occurred_at > now() - interval '24 hours' order by occurred_at desc;
   ```
3. Pull edge function logs from Supabase Dashboard → Functions → Logs.
4. If service-role key was compromised, also force-rotate all user sessions:
   ```sql
   -- nukes all refresh tokens; users must sign in again
   delete from auth.refresh_tokens;
   ```
5. File an incident note in `docs/incidents/YYYY-MM-DD-<short-name>.md` (create the dir if missing).

---

## Rate Limit Configuration

Wired in Phase 2 via the `check_rate_limit` RPC + `_shared/rate-limit.ts` helper.

| Edge function | Bucket key | Limit | Window | Rationale |
|---|---|---|---|---|
| `generate-dd-report` | `report:<user_id>` | 5 | 60 min | LLM cost guard; legit users rarely exceed this |
| `validate-invite-code` | `invite:<ip>` | 10 | 60 min | Brute-force guard on invite codes |

To raise a limit, edit the call site in the edge function and redeploy. No DB change needed (the buckets table doesn't store limits, the caller does).

---

## Audit Log

Append-only, defense-in-depth: RLS denies UPDATE/DELETE *and* a trigger raises an exception on any attempt. Visible at `/admin/audit`.

**Auto-logged events** (triggers in `20260612231420_phase2_rate_limits_audit.sql`):

- `role.assigned` / `role.removed` — on every `user_roles` insert/delete
- `report.deleted` — on every `dd_reports` delete
- `doc.attached` — when `report_documents.status` transitions to `attached`

**Manually-logged events** (call `log_audit(...)` from edge functions):

- `secret.rotated` — every rotation per the runbook above
- `payment.marked` — when admin marks a report paid manually (TBD with PR #10)
- `payment.refunded` — when Stripe webhook records a refund (TBD with PR #10)

Add new events as new code paths land. Use the dotted scheme `<domain>.<verb>` so the `/admin/audit` filter picks them up automatically.

---

## RLS Policy Audit

Every table with user-derived data has RLS enabled. Verify periodically:

```sql
-- Should list every public.* table; "rowsecurity" should be true for all.
select schemaname, tablename, rowsecurity
from pg_tables where schemaname = 'public'
order by tablename;
```

**Sensitive tables and who can access them:**

| Table | Read | Write |
|---|---|---|
| `dd_reports` | owner OR staff | owner (own rows) OR admin |
| `report_documents` | staff only | admin + analyst (via service role) |
| `user_roles` | staff only | admin only |
| `audit_log` | admin only | service role + authenticated (own actor_id only) |
| `rate_limit_buckets` | admin only | service role only |
| `invite_codes` | admin only | admin only |

---

## Checklist on Hiring a New Staff Member

1. Create their Supabase auth user (or have them sign up via invite code).
2. Admin grants role at `/admin/team`. This auto-logs to audit_log.
3. Document their access in `docs/team-roster.md` (create if missing).
4. If they need to deploy edge functions, generate a Supabase CLI personal access token scoped to this project only.

## Checklist on Offboarding

1. Admin removes role at `/admin/team`.
2. Revoke their Supabase auth session: `update auth.users set banned_until = 'infinity' where id = '<uuid>';`
3. If they had access to any of the secrets in the inventory above, **rotate that secret immediately**.
4. Log it: `log_audit('staff.offboarded', 'user', '<uuid>', '{"reason":"departure"}'::jsonb);`
