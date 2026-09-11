# Cove Billing + Number Provision (LOCKED 2026-09-11)

## Product rules
- Price: **$49/mo**
- **Card-gated 7-day trial** (no $1 charge)
- Provision Twilio DID **only after** payment method is saved
- Sticky DID while subscribed + **30-day cancel grace** (keep number, disable screening webhooks)
- After grace: **release** DID via **lazy release** on hot paths (no cron) — Twilio DELETE IncomingNumber, clear `twilio_number`, set `released_at`, `provisioning_status=released`
- Shared Komorebi Stripe account: always set `metadata.product=cove` for filtering

## Live Stripe objects
| Object | ID | Notes |
|--------|----|--------|
| Product | `prod_VEle9mZGSVfiUT` | Cove |
| Price | `price_1UEI7KBGpVuNZeuZ03lbTAtF` | $49/mo USD recurring; lookup key `cove_monthly_49` |
| Env override | `STRIPE_PRICE_ID_49_MONTHLY` | Prefer this in Edge Functions |

## Flow
1. User signs up + completes onboarding (prefs saved, `provisioning_status=pending`)
2. App invokes `create-checkout-session` (JWT) → Stripe Checkout (`mode=subscription`, `trial_period_days=7`, `payment_method_collection=always`, **no** `payment_method_types`)
3. Stripe webhook `checkout.session.completed` / `customer.subscription.created|updated` → store `stripe_customer_id`, `stripe_subscription_id`, `subscription_status=trialing|active`
4. On trial/active: webhook calls `provision-number` → buy US voice number, set `VoiceUrl` to `twilio-voice-inbound`, save `phone_numbers.twilio_number`, `provisioning_status=active`; clears `grace_ends_at` + `phone_numbers.reserved_until`
5. Customer Portal (`create-portal-session`) for cancel / update card — Settings → **Manage billing**
6. On `customer.subscription.deleted` → `subscription_status=grace`, `grace_ends_at=now()+30d`, `phone_numbers.reserved_until=+30d`, **keep Twilio DID**
7. After grace: **lazy release** (shared helper) on `stripe-webhook`, `provision-number`, `twilio-voice-inbound` start — release DID unless status became trialing/active again
8. `invoice.payment_failed` → `subscription_status=past_due`
9. `cancel_at_period_end` while still active/trialing → stay active until `subscription.deleted` (no early grace)

## Edge Functions
| Function | Auth | Role |
|----------|------|------|
| `create-checkout-session` | User JWT | Create/reuse Stripe customer; return `{url}` |
| `create-portal-session` | User JWT | Stripe billingPortal session; return `{url}`; return_url=`FRONTEND_URL/settings` |
| `stripe-webhook` | Stripe signature (`verify_jwt=false`) | Lifecycle + trigger provision; lazy DID release; ignore non-`cove` when `metadata.product` set |
| `provision-number` | Service role (from webhook) | Idempotent DID buy; lazy DID release; soft-fail if Twilio secrets missing |
| `twilio-voice-inbound` | Twilio (`verify_jwt=false`) | Live DTMF/voice path; **minimal** lazy-release await at start only |

Webhook events handled:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Shared helper: `supabase/functions/_shared/releaseExpiredDids.ts`

## Env (Supabase Edge Function secrets)
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_49_MONTHLY=price_1UEI7KBGpVuNZeuZ03lbTAtF
SUPABASE_URL=https://csbstpehuunaoyehhixp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...          # create-checkout-session / create-portal-session JWT validation
FRONTEND_URL=https://withcove.co   # Checkout + Portal return URLs (preferred)
# APP_BASE_URL remains Supabase host for voice callbacks if already set that way
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_VOICE_WEBHOOK_URL=      # optional; defaults to ${SUPABASE_URL}/functions/v1/twilio-voice-inbound
```

## Frontend env
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...   # optional until Elements
```

## Deploy checklist
1. Confirm live Product/Price IDs above (or set `STRIPE_PRICE_ID_49_MONTHLY`)
2. Apply migrations on production Supabase:
   - `20260911000000_billing_fields.sql`
   - `20260911010000_provisioning_status_released.sql` (adds `released` to `provisioning_status` check)
3. **Stripe Dashboard → Settings → Billing → Customer Portal**: enable portal; allow cancel subscription + update payment method (products/cancel settings as desired)
4. Deploy Edge Functions:
   ```bash
   supabase functions deploy create-checkout-session
   supabase functions deploy create-portal-session
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase functions deploy provision-number
   supabase functions deploy twilio-voice-inbound --no-verify-jwt
   ```
5. Set secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set ...`)
6. Stripe Dashboard → Webhooks → endpoint  
   `https://csbstpehuunaoyehhixp.supabase.co/functions/v1/stripe-webhook`  
   Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`  
   Copy signing secret → `STRIPE_WEBHOOK_SECRET`
7. Smoke test: onboarding → Checkout → webhook → `phone_numbers.twilio_number` populated
8. Confirm `metadata.product=cove` on Customer, Checkout Session, and Subscription
9. Cancel UX: Settings → Manage billing → Portal cancel → webhook `subscription.deleted` → status=`grace`, DID kept, `reserved_until` +30d
10. Lazy release: set `reserved_until` in the past on a grace row (staging) → hit webhook/provision/voice → Twilio number deleted, `provisioning_status=released`

## Manual test: cancel → grace → lazy release
1. Active/trialing user with `phone_numbers.twilio_number` set
2. Settings → **Manage billing** → cancel at period end (stays active) or cancel immediately per Portal config
3. When Stripe sends `customer.subscription.deleted`: expect `profiles.subscription_status=grace`, `grace_ends_at` ~+30d, `phone_numbers.reserved_until` ~+30d, **same** `twilio_number`
4. (Staging) Set `reserved_until` to yesterday; invoke `provision-number` or send a test Stripe event / inbound call — expect Twilio IncomingNumber deleted, `twilio_number=null`, `released_at` set, `provisioning_status=released`
5. Confirm live DTMF voice path unchanged for active users (trusted forward + screening still work)

## Tables
See migrations `20260911000000_billing_fields.sql`, `20260911010000_provisioning_status_released.sql`
