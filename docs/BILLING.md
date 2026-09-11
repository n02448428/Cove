# Cove Billing + Number Provision (LOCKED 2026-09-11)

## Product rules
- Price: **$49/mo**
- **Card-gated 7-day trial** (no $1 charge)
- Provision Twilio DID **only after** payment method is saved
- Sticky DID while subscribed + **30-day cancel grace** (keep number, disable screening webhooks)
- After grace: **release** DID (default) or optional paid hold (later)
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
4. On trial/active: webhook calls `provision-number` → buy US voice number, set `VoiceUrl` to `twilio-voice-inbound`, save `phone_numbers.twilio_number`, `provisioning_status=active`
5. Customer Portal for cancel/update card (later)
6. On `customer.subscription.deleted` → `subscription_status=grace`, `grace_ends_at=now()+30d`, `phone_numbers.reserved_until` set
7. Grace job (later) releases DID unless reactivated
8. `invoice.payment_failed` → `subscription_status=past_due`

## Edge Functions
| Function | Auth | Role |
|----------|------|------|
| `create-checkout-session` | User JWT | Create/reuse Stripe customer; return `{url}` |
| `stripe-webhook` | Stripe signature (`verify_jwt=false`) | Lifecycle + trigger provision; ignore non-`cove` when `metadata.product` set |
| `provision-number` | Service role (from webhook) | Idempotent DID buy; soft-fail if Twilio secrets missing |

Webhook events handled:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

## Env (Supabase Edge Function secrets)
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_49_MONTHLY=price_1UEI7KBGpVuNZeuZ03lbTAtF
SUPABASE_URL=https://csbstpehuunaoyehhixp.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...          # create-checkout-session JWT validation
FRONTEND_URL=https://withcove.co   # Checkout success/cancel (preferred)
# APP_BASE_URL remains Supabase host for voice callbacks if already set that way
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_VOICE_WEBHOOK_URL=      # optional; defaults to ${SUPABASE_URL}/functions/v1/twilio-voice-inbound
```

## Frontend env
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...   # optional until Elements/Portal
```

## Deploy checklist
1. Confirm live Product/Price IDs above (or set `STRIPE_PRICE_ID_49_MONTHLY`)
2. Apply migration `20260911000000_billing_fields.sql` on production Supabase
3. Deploy Edge Functions:
   ```bash
   supabase functions deploy create-checkout-session
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase functions deploy provision-number
   ```
4. Set secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set ...`)
5. Stripe Dashboard → Webhooks → endpoint  
   `https://csbstpehuunaoyehhixp.supabase.co/functions/v1/stripe-webhook`  
   Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`  
   Copy signing secret → `STRIPE_WEBHOOK_SECRET`
6. Smoke test: onboarding → Checkout (test card in test mode / live carefully) → webhook → `phone_numbers.twilio_number` populated
7. Confirm `metadata.product=cove` on Customer, Checkout Session, and Subscription

## Tables
See migration `20260911000000_billing_fields.sql`