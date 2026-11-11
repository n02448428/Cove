# Cove

> The AI receptionist for home-service businesses. It answers the calls you
> can't take, screens the caller, and sends you the details. No voicemail.

Cove is the flagship product of [VisionaryMinds Solutions](https://visionaryminds.solutions).
Live site: [withcove.co](https://withcove.co). Live demo line: **(619) 340-2683**.

## What Cove is

A missed call is a lost job. When a painter, plumber, or electrician is on a
ladder, driving, or asleep, their phone still rings — and the caller usually
hangs up and dials the next business.

Cove fixes that. The owner answers first, like always. If they don't pick up,
the call forwards to Cove automatically. Cove answers as an AI receptionist,
says so out loud, tells the caller the call may be recorded, asks what they
need, and sends the owner the details by email. The owner calls back when
they're free. Nothing goes to voicemail, and no lead disappears.

Cove only ever takes **missed** calls. It never intercepts a call the owner
would have answered.

## How a call works

1. **A customer calls.** The owner doesn't answer.
2. **Conditional call forwarding sends the call to Cove.** The owner sets this
   up once on their phone (AT&T/T-Mobile: `*21*<Cove number>#`;
   Verizon: `*72<number>`). It can be turned off any time.
3. **Blocked numbers are stopped first.** Before Cove answers, the inbound
   gate checks the caller's number against the blocked (RED) list. A blocked
   number is rejected immediately — no greeting, no ticket, no email.
   Everyone else proceeds.
4. **Cove answers.** Every call opens the same way: *"Hi, thanks for calling
   VisionaryMinds Solutions. This is Cove, our AI receptionist. This call may
   be recorded. May I ask your name?"*
5. **Cove screens the caller.** It asks for the caller's name, what they need,
   and the best number to reach them, then closes. Calls are capped at
   3 minutes, and Cove hangs up after 15 seconds of silence.
6. **Cove writes a ticket.** The call is classified as a **LEAD** (someone
   with a need), a **CUSTOMER** (someone with existing work), or a
   **SOLICITATION** (someone selling something). The full transcript and the
   call recording are saved with the ticket.
7. **The owner gets an email.** Name, type of call, summary, and the
   transcript — split into turns so it reads like a conversation. Urgent calls
   are marked urgent in the subject line.
8. **The owner reviews it in the dashboard.** The Quiet Inbox at
   withcove.co/dashboard shows every ticket. From a ticket the owner can mark
   it reviewed or actioned, trust a number (never screen it again), or block
   a number (never let it through again).

## Key features

- **Missed-call only.** Conditional forwarding — the owner always answers first.
- **Honest from the first second.** Every call opens by saying it is an AI
  receptionist and that the call may be recorded.
- **Real screening, not a message taker.** Cove asks the caller's name, need,
  and callback number, and holds a short conversation.
- **Solicitation filtering.** Sales and spam calls are classified as
  solicitations and, by default, don't trigger an email.
- **Urgent flagging.** Emergency keywords flag a call urgent, and urgent
  emails override the other notification settings.
- **Blocked numbers are rejected before the agent answers.** A number on the
  RED list is hung up on immediately — no greeting, no ticket, no email.
  (Live and tested Nov 10, 2026.)
- **Trusted and blocked lists.** The owner controls which numbers are
  rejected (RED) and which are trusted (GREEN). RED is enforced live. GREEN
  means trusted contacts — existing customers first — skip screening and get
  greeted by name; that behavior is planned, not built yet. Cove suggests;
  the owner decides. Lists are never changed automatically.
- **Tickets, not voicemail.** Every call produces a ticket with a transcript
  and recording, visible in the Quiet Inbox.
- **Email notifications.** A summary email after every call that matters.
  No SMS.
- **Custom questions.** The owner can set 1–5 screening questions, asked
  exactly as written.

## What Cove does not do

- No SMS or text messages — notifications are email only.
- No calendar booking or appointment scheduling.
- No CRM integrations.
- No voicemail.

## Tech stack

| Layer | Tech |
|-------|------|
| Voice / conversation | Retell AI (agent + LLM + voice) |
| Telephony | Twilio Elastic SIP Trunk |
| Backend | Supabase Edge Functions (Deno / TypeScript) |
| Database | Supabase (PostgreSQL) |
| Frontend | Vite + React (GitHub Pages) |
| Email | Resend |
| Billing | Stripe (self-serve billing is paused — white-glove only via VisionaryMinds Solutions) |

## Project structure

```
Cove/
├── docs/
│   ├── Cove-Call-Kernel.md          # Kernel spec v0.4 — source of truth for call rules
│   ├── TECHNICAL_SPECIFICATIONS.md  # Deep technical spec: architecture, flows, schema
│   ├── RETELL_AGENT.md              # Live Retell agent (v7) — IDs, prompt, greeting, history
│   ├── Cove-Offer.md                # Older offer doc (see pricing note below)
│   ├── Cove-Product-Voice.md        # Product voice and dashboard language
│   ├── Cove-Voice-Lines.md          # Default greeting, questions, keywords
│   └── archive/                     # Obsolete plans (history only)
├── supabase/
│   ├── migrations/                  # PostgreSQL schema (kernel, billing, classification)
│   └── functions/
│       ├── _shared/cove.ts          # Shared helpers (Supabase client, audit, notifications)
│       ├── retell-webhook/        # Live Retell post-call webhook (tickets + email)
│       ├── retell-inbound-gate/   # Live RED-list gate (rejects blocked numbers pre-answer)
│       ├── call-hangup/           # Hangup handling
│       ├── twilio-voice-inbound/    # Legacy Twilio voice path (see note below)
│       ├── screening-step/          # Legacy screening state machine
│       ├── call-transcribe/         # Async transcription callback (legacy path)
│       ├── call-status/             # Dial status + completion (legacy path)
│       ├── send-ticket-notifications/ # Ticket summary emails
│       ├── send-digest-emails/      # Email digests
│       ├── stripe-webhook/          # Stripe lifecycle events (billing paused)
│       ├── create-portal-session/   # Stripe Customer Portal (billing paused)
│       ├── provision-number/        # Twilio number provisioning (billing paused)
│       └── sweep-stale-tickets/     # Ticket housekeeping
├── src/                             # React frontend (withcove.co)
│   ├── pages/                       # Landing, Auth, Onboarding, Dashboard, Settings, Admin
│   ├── components/                  # Including InboxView (the Quiet Inbox)
│   ├── services/api.js              # Supabase queries + edge function calls
│   └── lib/supabase.js
├── .github/workflows/deploy.yml     # Auto-deploys frontend to GitHub Pages on push to main
└── README.md
```

### A note on the two voice paths

There are two voice paths in this codebase, and only one is live.

- **Live path — Retell AI.** The business line is attached to a Twilio SIP
  trunk that hands calls to a Retell AI agent. Before the agent answers,
  Retell checks the call with the `retell-inbound-gate` edge function: a
  number on the blocked (RED) list is rejected immediately. Everyone else
  gets the conversation, and afterwards Retell posts the analyzed call to
  the `retell-webhook` edge function, which creates the ticket and triggers
  the email. This is what callers experience today. All three functions
  (`retell-inbound-gate`, `retell-webhook`, `call-hangup`) are committed to
  this repo.
- **Legacy path — Twilio TwiML.** The `twilio-voice-inbound` and
  `screening-step` functions run the original keypad-code screening flow
  (RED/GREEN list routing, spoken questions, recorded answers). This path is
  no longer in front of callers, but it is where the kernel's routing and
  screening rules are implemented, and it stays in the repo as the reference
  implementation of those rules.

## Data model

- `profiles` — one row per user: account, display name, email, subscription
  and billing status.
- `phone_numbers` — the user's Cove number (`twilio_number`), notification
  email address, provisioning status, and per-type email toggles
  (`notify_email_lead`, `notify_email_customer`, `notify_email_solicitation`,
  `notify_email_urgent`).
- `caller_lists` — RED / GREEN phone numbers per user. RED is blocked, GREEN
  skips screening.
- `access_codes` — keypad codes (min 3 digits) for bypassing screening on the
  legacy path.
- `screening_questions` — 1–5 questions per user, asked in order, exactly as
  written.
- `review_tickets` — one row per call: caller number and name, status
  (`collecting`, `transcribing`, `new`, `reviewed`, `actioned`, `failed`),
  classification (`LEAD`, `CUSTOMER`, `SOLICITATION`), summary, and how the
  call ended.
- `review_ticket_answers` — one row per question and attempt, with the
  recording URL, duration, and transcript. Retell calls store the whole
  conversation as a single row with question text `Retell call transcript`.
- `call_logs` — the canonical master call record. Outcome is one of
  `received`, `screening`, `rejected`, `connected_live`, `screened`,
  `code_connected`, `no_answer`, `failed`.
- `call_audit` — an audit trail of call events.

All kernel tables have row-level security: a user can only see and change
their own rows.

## Pricing

Cove is currently sold as a white-glove service by VisionaryMinds Solutions:
**$2,000 setup + $500/month**. Self-serve billing is paused.

Note: older docs in this repo used to quote different prices. Those are now
aligned: `docs/Cove-Offer.md` states the current price above, and the
paused self-serve tier's docs and checkout were removed Nov 10, 2026.

## Setup

### 1. Clone & install

```bash
git clone https://github.com/n02448428/Cove.git
cd Cove
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and set the frontend values:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend)

Edge function secrets (Twilio, Retell, Resend, Supabase service role, Stripe)
are set in the Supabase dashboard, not in the frontend env. Never commit
`.env`.

### 3. Run the frontend locally

```bash
npm run dev
```

### 4. Deploy

- **Frontend:** push to `main` — GitHub Actions deploys to GitHub Pages
  automatically (withcove.co).
- **Edge functions:** deploy with the Supabase CLI, e.g.
  `supabase functions deploy send-ticket-notifications`. Functions that
  receive webhooks from outside Supabase (Retell, Stripe, Twilio) are
  deployed with `--no-verify-jwt` and authenticate the webhook instead.

## Webhook configuration

- **Retell inbound gate (live):** before the agent answers, Retell checks
  the call with
  `https://csbstpehuunaoyehhixp.supabase.co/functions/v1/retell-inbound-gate`.
  A number on the blocked (RED) list gets `{"call_inbound": {"reject": true}}`
  and is hung up on immediately — no greeting, no ticket. Everyone else
  passes through. Authentication is a `?token=` URL token (checked against
  the `RETELL_INBOUND_TOKEN` secret). The gate is fail-open: any lookup
  error lets the call through. Tested live Nov 10, 2026.
- **Retell agent webhook (live):** the agent posts call events to
  `https://csbstpehuunaoyehhixp.supabase.co/functions/v1/retell-webhook`.
  Only `call_analyzed` creates a ticket. Authentication is an HMAC signature
  (`x-retell-signature`, checked against the `RETELL_API_KEY` secret) or a
  `?token=` URL token (checked against `RETELL_WEBHOOK_TOKEN`).
- **Twilio voice webhook (legacy path):**
  `https://csbstpehuunaoyehhixp.supabase.co/functions/v1/twilio-voice-inbound`.
- **Stripe webhook (billing paused):**
  `https://csbstpehuunaoyehhixp.supabase.co/functions/v1/stripe-webhook`.

## Docs

- `docs/Cove-Call-Kernel.md` — the kernel: routing, screening,
  classification, lists, notification defaults, invariants. The source of
  truth for how calls are handled.
- `docs/TECHNICAL_SPECIFICATIONS.md` — the full technical spec: architecture,
  call flow, Retell and Twilio config, database schema, edge function
  catalog, security, costs, and limitations.
- `docs/Cove-Voice-Lines.md` — the default greeting, questions, closings,
  and emergency/solicitation keyword lists.
- `docs/Cove-Product-Voice.md` — how Cove talks: calm, brief, professional,
  invisible.

## License

Private — all rights reserved.
