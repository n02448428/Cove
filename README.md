# Cove

> Personal call screener. RED numbers rejected, GREEN numbers connect live,
> everyone else gets a keypad code or a short question screening that produces a
> review ticket. No voicemail, no keyword rules, no AI voice agent — pure Twilio.

**Source of truth:** [`docs/Cove-Call-Kernel.md`](docs/Cove-Call-Kernel.md) — the
Cove Call Kernel defines call routing, screening, and the data model. Everything
else (this README, the frontend, the edge functions) implements the kernel. The
old MVP plan is archived at
[`docs/archive/Cove-MVP-Build-Plan-v4.md`](docs/archive/Cove-MVP-Build-Plan-v4.md)
and is obsolete.

## How it works

1. You forward your number to your Cove Twilio number.
2. Every incoming call hits the `twilio-voice-inbound` edge function.
3. The kernel classifies the caller:
   - **RED** → reject immediately.
   - **GREEN** → connect live to your real number.
   - **Everyone else (Yellow)** → keypad code bypass, then 1–5 spoken questions
     with recorded + transcribed answers, then a review ticket.
   - RED overrides GREEN.
4. Yellow callers can enter a private keypad code to connect live.
5. The dashboard shows RED/GREEN lists, access codes, questions, review tickets,
   and the call log.

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Vite + React (GitHub Pages) |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| Database | Supabase (PostgreSQL) |
| Telephony | Twilio (voice + transcription; no Retell) |
| Billing | Stripe (checkout + customer portal) |

## Project structure

```
Cove/
├── docs/
│   ├── Cove-Call-Kernel.md          # Kernel spec — source of truth
│   ├── BILLING.md
│   └── archive/                      # obsolete plans (history only)
├── supabase/
│   ├── migrations/
│   │   └── 20260913000000_call_kernel.sql   # kernel schema (applied)
│   └── functions/
│       ├── _shared/cove.ts           # shared helpers (supabase client, TwiML, audit)
│       ├── twilio-voice-inbound/     # entry: classify RED/GREEN/Yellow
│       ├── screening-step/           # Yellow state machine (code → questions)
│       ├── call-transcribe/          # async transcription callback
│       ├── call-status/              # Dial status + completion
│       ├── provision-number/         # Twilio number provisioning
│       ├── create-checkout-session/  # Stripe checkout
│       ├── create-portal-session/    # Stripe portal
│       └── stripe-webhook/           # Stripe webhook
├── src/                              # React frontend
│   ├── pages/                        # Landing, Auth, Onboarding, Dashboard, Settings, Admin
│   ├── services/api.js               # Supabase queries + edge function calls
│   └── lib/supabase.js
├── .github/workflows/deploy.yml      # auto-deploys frontend to GitHub Pages on push to main
└── README.md
```

## Data model (kernel)

- `caller_lists` — RED/GREEN phone numbers per user.
- `access_codes` — keypad codes (min 3 digits) for Yellow bypass; managed in the
  GREEN section of the dashboard.
- `screening_questions` — 1–5 questions per user, spoken verbatim.
- `review_tickets` + `review_ticket_answers` — Yellow screening product object:
  caller, status, captured answers, recordings, transcripts.
- `call_logs` — canonical master call record (outcome enum: `received`,
  `screening`, `rejected`, `connected_live`, `screened`, `code_connected`,
  `no_answer`, `failed`).

See the kernel spec and the applied migration for full schema + RLS.

## Setup

### 1. Clone & install
```bash
git clone https://github.com/n02448428/Cove.git
cd Cove
npm install
```

### 2. Configure environment
Copy `.env.example` and set:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (frontend)

Edge function secrets (Twilio, Supabase service role, Stripe) are set in the
Supabase dashboard, not in the frontend env.

### 3. Run the frontend locally
```bash
npm run dev
```

### 4. Deploy
- **Frontend:** push to `main` — GitHub Actions deploys to GitHub Pages
  automatically.
- **Edge functions:** deployed via the Supabase connector (see
  `supabase/functions/`). The repo keeps `_shared/cove.ts` as the shared source;
  deployed functions inline the shared helpers into a single `index.ts`.

## Twilio webhook configuration

Point your Twilio number's voice webhook to:
- **Incoming call:** `https://<project>.supabase.co/functions/v1/twilio-voice-inbound`
- The kernel's TwiML drives the rest (screening-step, call-status,
  call-transcribe are referenced by the inbound TwiML automatically).

## License

Private — all rights reserved.
