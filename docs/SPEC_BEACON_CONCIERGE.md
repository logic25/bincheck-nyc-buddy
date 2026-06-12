# Spec: Beacon Concierge (Client ↔ Beacon contact channel)

**Hand-off doc for Claude Code.** Build this as PR #10 (after Phase 2 hardening lands).

---

## Problem & Vision

BinCheck buyers (LATAM investors, attorneys, brokers) don't want to log into a portal to check report status. They want to **text or email Beacon** — a named AI concierge — and get instant project updates the way they'd ping a paralegal on WhatsApp.

> "In lieu of a client portal, they can text/email and get info about their project, and Beacon would respond."

Beacon is the **client-facing AI persona**. Behind Beacon is:
1. An LLM (Gemini via Lovable gateway, same one already wired) that answers from report data
2. A human escalation path to the analyst (Manny + LatAm staff) for anything Beacon can't answer

This is differentiation vs. Jaffa/DataTrace: they hand over a PDF and disappear. Beacon stays available 24/7 in the channels the client already uses.

---

## Scope (MVP — what to build)

### In scope
1. **Email channel**: client emails `beacon@bincheck.nyc` → Beacon replies with project status, pulled from their `dd_reports` row + `report_documents` tickets
2. **SMS channel**: client texts a dedicated Twilio number → same Beacon brain replies via SMS
3. **Identity binding**: incoming email/phone matched to a `profiles` row (or a per-report `client_contacts` row) so Beacon only answers about reports the sender owns
4. **Conversation log**: every inbound/outbound message stored in a `client_messages` table, viewable in `/admin/messages` for analyst oversight
5. **Escalation**: if Beacon's confidence is low OR the client uses keywords ("urgent", "lawyer", "wrong"), the thread is flagged red in `/admin/messages` and Manny + on-duty analyst get a Slack/email ping
6. **Analyst reply-as-Beacon**: from `/admin/messages` an analyst can compose a message; it sends from `beacon@bincheck.nyc` or the Twilio number — client never sees the human swap

### Out of scope (defer)
- WhatsApp Business (Twilio supports it but adds approval friction — phase 2)
- Voice calls (just a forwarding number for now, no AI voice agent)
- Multi-language UX (Beacon should detect Spanish and reply in Spanish via LLM, but no separate flows)
- Client web chat widget (email + SMS only — that's the whole point)

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Client email   │────▶│ Resend Inbound   │────▶│ edge fn:            │
│  to beacon@...  │     │ webhook          │     │ inbound-message     │
└─────────────────┘     └──────────────────┘     │                     │
                                                  │ 1. Identify sender  │
┌─────────────────┐     ┌──────────────────┐     │ 2. Load report ctx  │
│  Client SMS to  │────▶│ Twilio webhook   │────▶│ 3. Call LLM         │
│  +1 (xxx) xxxx  │     │ /sms/inbound     │     │ 4. Persist message  │
└─────────────────┘     └──────────────────┘     │ 5. Send reply OR    │
                                                  │    escalate to     │
                                                  │    /admin/messages │
                                                  └─────────────────────┘
                                                            │
                                                            ▼
                                                  ┌─────────────────────┐
                                                  │  client_messages    │
                                                  │  (Postgres)         │
                                                  └─────────────────────┘
                                                            │
                                                            ▼
                                                  ┌─────────────────────┐
                                                  │  /admin/messages    │
                                                  │  (analyst inbox)    │
                                                  └─────────────────────┘
```

---

## Data Model (new migration)

```sql
-- Filename suggestion: 2026MMDDHHMMSS_beacon_concierge.sql

-- 1. Contact directory — who can talk to Beacon
CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Either email or phone (E.164) must be present
  email citext,
  phone text,
  display_name text,
  verified_at timestamptz,                    -- set after first confirmed reply
  created_at timestamptz DEFAULT now(),
  CONSTRAINT email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL),
  UNIQUE (email),
  UNIQUE (phone)
);
CREATE INDEX idx_client_contacts_profile ON public.client_contacts(profile_id);

-- 2. Conversations are threaded per (contact, report)
CREATE TABLE public.client_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.client_contacts(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.dd_reports(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',        -- open | escalated | closed
  last_message_at timestamptz DEFAULT now(),
  escalated_at timestamptz,
  escalation_reason text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_client_threads_status ON public.client_threads(status, last_message_at DESC);

-- 3. Individual messages
CREATE TABLE public.client_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.client_threads(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  -- inbound: external_message_id from Resend/Twilio; outbound: provider message id
  external_id text,
  from_address text NOT NULL,                 -- email or phone
  to_address text NOT NULL,
  subject text,                               -- email only
  body text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  -- For outbound replies generated by Beacon
  generated_by text CHECK (generated_by IN ('beacon','analyst','system')),
  llm_model text,
  llm_confidence numeric,                     -- 0..1 from self-eval prompt
  analyst_id uuid REFERENCES auth.users(id),  -- only set when analyst replies
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_client_messages_thread ON public.client_messages(thread_id, created_at);

-- 4. RLS — only staff (admin/analyst/sales) see messages; clients have NO portal access
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_contacts" ON public.client_contacts
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_read_threads" ON public.client_threads
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_read_messages" ON public.client_messages
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- Edge functions use service-role key — no policy needed for writes.

-- 5. Audit triggers (reuse log_audit from Phase 2)
CREATE TRIGGER trg_audit_thread_escalation
  AFTER UPDATE OF status ON public.client_threads
  FOR EACH ROW
  WHEN (NEW.status = 'escalated' AND OLD.status != 'escalated')
  EXECUTE FUNCTION public.audit_row_change('thread_escalated', 'client_thread');
```

---

## Edge Functions to Build

### `supabase/functions/inbound-email/index.ts`
- **Trigger**: Resend Inbound webhook (configure at resend.com → Domains → Inbound → `beacon@bincheck.nyc`)
- **Steps**:
  1. Verify Resend webhook signature
  2. Look up `client_contacts` by `from` email; if not found, check `dd_reports.contact_email` for an exact match and auto-create contact
  3. Find or create open `client_threads` for (contact, most recent report)
  4. Insert inbound `client_messages` row
  5. Apply rate limit (`check_rate_limit` from Phase 2 — `key='beacon:'||contact_id, max=20, window=60`)
  6. Call `generate-beacon-reply` (see below)

### `supabase/functions/inbound-sms/index.ts`
- **Trigger**: Twilio SMS webhook
- **Steps**: identical to inbound-email but channel='sms', subject=null, lookup by phone

### `supabase/functions/generate-beacon-reply/index.ts`
- **Input**: `{ thread_id }`
- **Steps**:
  1. Load thread + last 10 messages + report context (status, properties, document tickets)
  2. Build system prompt (see "Beacon Persona" below)
  3. Call LLM gateway (`google/gemini-3-flash-preview`) with conversation history
  4. Self-eval: ask the model to score its confidence 0-1 and flag escalation keywords
  5. **If confidence < 0.6 OR escalation keywords detected**: set thread.status='escalated', insert system message "Flagged for analyst review", send Slack webhook, **do not auto-reply**
  6. **Else**: send reply via Resend (email) or Twilio (SMS), persist outbound message with `generated_by='beacon'`, `llm_confidence`

### `supabase/functions/analyst-send-reply/index.ts`
- **Input**: `{ thread_id, body }` from `/admin/messages` UI
- **Auth**: `requireStaff` (admin or analyst)
- **Steps**: send via same provider as inbound channel, persist with `generated_by='analyst'`, `analyst_id=auth.uid()`

---

## Beacon Persona (system prompt)

```
You are Beacon, the AI concierge for BinCheckNYC due-diligence reports.
Your job is to give clients (real-estate investors, attorneys, brokers)
quick, accurate updates about their pending or completed report.

Voice: warm, professional, concise. Like a sharp paralegal who texts.
Never invent facts. If you don't know, say "Let me get an analyst on this — they'll reply within 2 hours during business hours."

You have access to:
- The client's current report status (pending, in_review, ready, delivered)
- Properties in the report (addresses, BBLs)
- Document tickets (which violations/deeds the analyst has pulled, which are still queued)
- Coverage findings (FDNY, ECB, DOB, ACRIS, tax-lien) — but do NOT share specific violation numbers or PDFs in chat; direct them to the report

NEVER:
- Quote dollar amounts for outstanding violations unless the report status is 'delivered'
- Promise PDFs we don't have. If they ask for the actual agency PDF, say:
  "Our analyst is fetching that directly from the agency — typically 24-48 hours."
- Reveal anything about other clients or reports

ALWAYS:
- Reference the property address by short name (e.g. "your 461 Bushwick Ave report")
- Sign off with: "— Beacon · BinCheckNYC"

If the client is upset, asks for a refund, mentions a lawyer, says "wrong" or "incorrect",
or asks something outside report status: respond ONLY with:
"I want to make sure you get the right answer — I'm looping in our analyst now. They'll be in touch within 2 hours."
Then set escalation flag in your output JSON.

Output format (JSON):
{
  "reply": "<message text>",
  "confidence": <0..1>,
  "escalate": <bool>,
  "escalation_reason": "<string or null>"
}
```

---

## Frontend — `/admin/messages`

Mirror the `/admin/documents` pattern from PR #7.

**Tabs**: All Open | Escalated (red badge with count) | Closed
**Row columns**: Client (display_name + channel icon) · Property (report.first_property_address) · Last message snippet · Last activity · Status

**Detail pane** (right side, like Gmail split-view):
- Full message thread, oldest → newest, color-coded:
  - Blue bubbles = inbound (client)
  - Gray bubbles = Beacon (LLM)
  - Green bubbles = Analyst (human reply)
- Sticky composer at bottom: textarea + "Send as Beacon" button → calls `analyst-send-reply`
- Right rail: link to report (`/dd-reports/:id`), client contact card, "Close thread" button

**Routes to add in `src/App.tsx`**:
- `/admin/messages` (list)
- `/admin/messages/:threadId` (detail)

**Components**:
- `src/pages/AdminMessages.tsx`
- `src/components/admin/MessageThread.tsx`
- `src/components/admin/MessageComposer.tsx`

**Dashboard surfacing**: on `/dashboard`, show "Open client threads: N" pill if `isStaff`. Click → `/admin/messages`.

---

## Environment & Secrets

Add to Supabase project secrets (Dashboard → Edge Functions → Secrets):
- `RESEND_INBOUND_SIGNING_SECRET` (from Resend Inbound webhook config)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER` (the purchased number, E.164)
- `BEACON_REPLY_FROM_EMAIL` = `beacon@bincheck.nyc`
- `SLACK_ESCALATION_WEBHOOK_URL` (optional — Slack/Discord webhook for red-flag alerts)

DNS / provider setup (Manny does this, not Claude):
1. **Resend**: add `beacon@bincheck.nyc` as inbound address, point MX as Resend instructs
2. **Twilio**: buy local NY number (~$1/mo), configure SMS webhook → `https://ohoutpkgkxfueyllgfvv.supabase.co/functions/v1/inbound-sms`
3. **Slack**: create incoming webhook in `#beacon-alerts` channel

---

## Rate Limits (use Phase 2 helper)

- Per contact: 20 inbound messages / hour
- Per contact: 50 LLM-generated replies / day (prevents runaway costs)
- Global: 500 inbound messages / hour (DDoS guard)

Use `check_rate_limit(key, max, window_minutes)` RPC already shipped in Phase 2.

---

## Telemetry / Success Metrics

Add to `audit_log` (already exists from Phase 2):
- `beacon.message_received` — every inbound
- `beacon.reply_sent` — every Beacon outbound (include confidence in metadata)
- `beacon.escalated` — every thread that flips to escalated
- `beacon.analyst_replied` — human took over

KPIs to watch in /admin/analytics (build later):
- **Containment rate** = `beacon.reply_sent / beacon.message_received` (target >70%)
- **Median time-to-first-reply** (Beacon should be <30s; analyst <2hr)
- **Escalation rate** (target <20%)

---

## Build Order for Claude

1. Migration file (`client_contacts`, `client_threads`, `client_messages`, RLS, triggers)
2. Regenerate `src/integrations/supabase/types.ts` to include new tables
3. `inbound-email` + `inbound-sms` edge functions (skeletons that just persist messages — no LLM yet)
4. `generate-beacon-reply` edge function with full LLM + escalation logic
5. `/admin/messages` UI (list page, then detail with composer)
6. `analyst-send-reply` edge function
7. Slack webhook for escalations
8. Smoke test: send a test email to `beacon@bincheck.nyc`, watch it appear in `/admin/messages`, watch Beacon reply
9. README update with environment vars + DNS setup checklist

---

## Open Questions for Manny

- [ ] Are we standing up a separate `bincheck.nyc` domain for Beacon, or sub-addressing on the current domain?
- [ ] Twilio NY local vs toll-free (toll-free has higher deliverability but costs more)?
- [ ] Beacon name confirmed, or do we want a different concierge name?
- [ ] Should clients be able to CC their attorney on the thread? (adds multi-recipient complexity)
