# AI Call Screener — MVP Build Plan v4

## What it does
User forwards their existing number to their AI concierge number, auto-assigned on signup. AI answers all calls first and routes them. Trusted contacts skip AI and forward immediately to the user’s real number; if the user doesn’t answer, Twilio records voicemail. Unknown callers are screened by Retell.

- AI asks: "Who are you and what is the reason for your call?"
- AI asks: "Are you a salesperson or calling to sell something?"
- If yes to the solicitor question, or the reason matches a block keyword, Retell blocks the call and tells the caller to remove the number.
- If the reason matches an urgent keyword, Retell returns forward; Twilio dials the user’s real number and, on no-answer, records voicemail.
- Otherwise, Twilio records voicemail.
- If there is 10 seconds of silence, AI says "Are you there? No response detected, goodbye," hangs up, and logs the call as blocked.
- All calls are logged. The dashboard shows outcome, summary, transcript, and voicemail recording.

## Cost per call
Retell screening only, about 1 minute: $0.13. Twilio inbound, outbound, SMS, and transcription: about $0.07. Total per screened call is about $0.20. Trusted contact and spam calls are much cheaper because Retell time is short or zero.

## Tech Stack
Frontend is Vite + React. Backend, auth, and database are Supabase. Telephony is Twilio. AI voice is Retell. Business logic runs in Supabase Edge Functions. Email uses Resend.

## User Flow
1. Sign up with email.
2. App creates the Supabase user first, then auto-assigns a Twilio concierge number via Twilio API. If Twilio provisioning fails, retry once. If it still fails, mark provisioning as failed and stop onboarding until fixed.
3. Onboarding form collects:
- Real phone number, auto-formatted to E.164.
- Trusted contacts, one per line with name and number.
- Urgent keywords, pre-filled defaults but editable: emergency, accident, hospital, urgent, 911, police, fire, ambulance, school.
- Block keywords, pre-filled defaults but editable: survey, warranty, offer, loan, credit, investment, sales, marketing, promotion, solicitor.
- SMS notifications toggle.
- Email notifications toggle.
4. Forwarding instructions page shows the assigned concierge number. Carrier forwarding instructions are carrier-dependent; do not promise universal *72/*73 behavior.
5. Test by calling your number from another phone.
6. Dashboard shows all calls: outcome, summary, transcript, voicemail.

## Build Order
1. Supabase setup.
2. Twilio account and number provisioning.
3. Retell agent.
4. Inbound webhook.
5. Call completion handler.
6. Admin console.
7. React app: auth, onboarding, forwarding page, dashboard, settings.
8. End-to-end test.

## 1. Supabase Setup
Enable email/password auth.

Tables:

profiles
- id (uuid, PK)
- email (text)
- created_at (timestamp)

phone_numbers
- id (uuid, PK)
- user_id (uuid, FK -> profiles.id, unique)
- real_number (text, E.164 format, check constraint)
- twilio_number (text, E.164 format, unique, check constraint)
- notify_sms (bool)
- notify_email (bool)
- provisioning_status (text: pending | active | failed)
- created_at (timestamp)

screening_rules
- id (uuid, PK)
- user_id (uuid, FK -> profiles.id, unique)
- urgent_keywords (text[])
- block_keywords (text[])
- created_at (timestamp)
- updated_at (timestamp)

trusted_contacts
- id (uuid, PK)
- user_id (uuid, FK -> profiles.id)
- contact_name (text)
- phone_number (text, E.164 format, check constraint)
- created_at (timestamp)

call_logs
- id (uuid, PK)
- user_id (uuid, FK -> profiles.id)
- call_sid (text, unique)
- provider_ids (jsonb)
- caller_number (text)
- caller_name (text)
- outcome (text: received | screened | forwarded | voicemail | blocked | failed)
- status (text: received | screened | forwarded | voicemail | blocked | failed)
- failure_reason (text)
- summary (text)
- transcript (text)
- voicemail_url (text)
- created_at (timestamp)
- updated_at (timestamp)

call_audit
- id (uuid, PK)
- user_id (uuid, FK -> profiles.id)
- call_sid (text)
- event_type (text)
- payload (jsonb)
- created_at (timestamp)
- provider (text)
- latency_ms (integer)
- retry_count (integer)
- failure_reason (text)

RLS: users see only their own rows. All frontend access uses RLS. call_logs and call_audit inserts and updates happen through backend Edge Functions using the service role key. Account deletion: mark account pending delete, release the Twilio number with retries, purge all user rows from all tables with cascade cleanup, then delete the user profile.

## 2. Twilio Setup
Create account.

On user signup: create the Supabase profile first, then call Twilio API to buy and assign one US voice-capable number per user. Retry once on failure. If both attempts fail, mark provisioning_status = failed and stop. Set that number’s Voice webhook to POST -> /twilio/voice-inbound. Store number in phone_numbers.twilio_number. On account deletion: call Twilio API to release number immediately, with retry.

## 3. Retell Setup
Create account, get API key. Create one agent: Concierge MVP. Silence timeout is 10 seconds. On silence, say "Are you there? No response detected, goodbye," hang up, and log as blocked.

Prompt:
1. Greet caller.
2. Ask: "Who are you and what is the reason for your call?"
3. Ask: "Are you a salesperson or calling to sell a product or service?"
4. If yes to solicitor question, or reason matches a block keyword, return action: block. Tell caller to remove the number.
5. If reason matches an urgent keyword, return action: forward.
6. Otherwise, return action: voicemail, say owner is unavailable.

Structured output:
- action
- caller_name
- summary
- call_sid

Urgent and block keywords, plus trusted contact numbers, are passed as dynamic context at call time. Connect Retell to Twilio via Retell’s SIP/Twilio integration. Retell owns screening only. It does not own voicemail recording, notifications, or final logging.

## 4. Inbound Webhook
Endpoint: POST /twilio/voice-inbound

1. Read To (twilio number), From (caller number, already in E.164), and Twilio CallSid.
2. Look up user by twilio_number.
3. If caller number matches a trusted contact, TwiML <Dial> real_number with caller ID set to the original caller. On no-answer, Twilio <Record> voicemail and log as voicemail.
4. Otherwise, load screening_rules and trusted_contacts. Pass urgent keywords, block keywords, trusted contact numbers, caller number, and call_sid to Retell agent as dynamic context at call time.
5. Return TwiML connecting the call to Retell agent.
Fallback, if anything fails: TwiML <Record> voicemail directly, log as voicemail, and store failure_reason.

## 5. Call Completion Handler
On Retell webhook call done:

1. Read output: action, caller_name, summary, transcript, call_sid.
2. Check call_logs by call_sid. If terminal status already exists, do nothing.
3. Execute outcome:
- forward -> Twilio <Dial> real_number with caller ID set to the original caller number. On no-answer, Twilio <Record> voicemail. Log as forwarded or voicemail accordingly.
- voicemail -> Twilio <Record> with transcribe=true, save voicemail_url and transcript, then log as voicemail.
- block -> already ended by Retell, log as blocked.
- failed -> log failure_reason and fallback to voicemail.
3a. If notify_sms is true and outcome is voicemail, send Twilio SMS to real_number with caller name, summary, and transcript. Deduplicate by call_sid.
3b. If notify_email is true and outcome is voicemail, send Resend email to the user’s email with caller name, summary, and transcript. Deduplicate by call_sid.
4. Insert or update row in call_logs using call_sid as the idempotency key.
5. Write an audit event to call_audit for each important transition.

## 6. Admin Console
Add a small internal admin console for debugging only.

Pages:
- Failure list.
- Provisioning status.
- Call timeline by call_sid.
- Raw event payload viewer.
- Retry queue.

Permissions:
- Admin only.

Actions:
- View details.
- Retry failed step.
- Mark resolved.

This console is not for end users. It is there so you can see where the system broke without digging through logs.

## 7. Frontend
Pages: Landing | Auth | Onboarding | Forwarding Instructions | Dashboard | Settings | Admin Console

Auth
- Supabase email/password.
- After login: if no screening_rules or provisioning_status is not active, show Onboarding / provisioning status page. Otherwise show Dashboard.

Onboarding
- Fields:
  - Real phone number, auto-format to E.164 on submit.
  - Trusted contacts textarea, name + number one per line.
  - Urgent keywords tag input, pre-filled with defaults, editable.
  - Block keywords tag input, pre-filled with defaults, editable.
  - SMS notifications toggle.
  - Email notifications toggle.
- On submit: validate real_number format, save phone_numbers, screening_rules, trusted_contacts.
- Twilio number already assigned at signup.
- Redirect to Forwarding Instructions.

Forwarding Instructions
- "Your AI concierge number: {twilio_number}"
- Carrier forwarding instructions are carrier-dependent; do not promise universal *72/*73 behavior.
- Test by calling your number from another phone.

Dashboard
- List of calls: caller number/name, outcome, time, summary.
- Click to expand: full transcript + playable voicemail audio.
- Filter by outcome (forwarded, voicemail, blocked) and date range.
- Export to CSV.

Settings
- Same fields as onboarding: real number, trusted contacts, urgent keywords, block keywords, SMS toggle, email toggle.
- Changes save immediately.

Admin Console
- Failure list.
- Provisioning status.
- Call timeline by call_sid.
- Raw event payload viewer.
- Retry queue.
- Admin only.

## 8. Decision Logic
- Caller in trusted_contacts -> forward immediately (no Retell). On no-answer -> voicemail.
- 10s silence -> blocked (Retell handles).
- Retell returns block -> blocked.
- Retell returns forward -> Twilio dials real_number. On no-answer -> voicemail.
- Retell returns voicemail -> Twilio <Record>.
- Fallback (any error) -> Twilio <Record>.
- Duplicate webhook or repeated provider event -> no-op.
- If any provider step fails after routing starts -> log failed and fallback to voicemail.

## 9. Environment Variables
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
RETELL_API_KEY
RETELL_AGENT_ID
RESEND_API_KEY
APP_BASE_URL

## 10. MVP Checklist
- Signup creates Supabase user first, then auto-provisions Twilio number, retries once on failure, and marks provisioning failed if needed.
- Phone numbers stored and validated in E.164 format with DB constraints.
- Keywords stored structurally, not plain text.
- Onboarding saves real number, contacts, keywords with defaults, notification prefs.
- User sees concierge number and carrier-dependent forwarding instructions.
- Trusted contact call -> forwarded immediately, on no-answer -> voicemail, logged.
- 10s silence -> AI says goodbye, hangs up, logged as blocked.
- Solicitor question asked on every unknown call.
- Spam/block keyword match -> blocked by Retell, logged.
- Unknown urgent call -> keyword detected, Twilio dials user, on no-answer -> voicemail, logged.
- Unknown non-urgent call -> Twilio records voicemail, transcribed, logged.
- Webhook handlers are idempotent using call_sid.
- Duplicate provider events do not double-log or double-notify.
- SMS sent to user if notify_sms enabled, deduped by call_sid.
- Email sent via Resend if notify_email enabled, deduped by call_sid.
- Account deletion releases Twilio number and purges all data with retries.
- All calls on dashboard with outcome, summary, transcript, playable voicemail.
- Admin console shows failures, retries, provisioning status, and raw payloads.
- Every provider failure writes a call_audit event.
