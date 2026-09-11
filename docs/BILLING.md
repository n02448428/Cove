# Cove Billing + Number Provision (LOCKED 2026-09-11)

## Product rules
- Price: **$49/mo**
- **Card-gated 7-day trial** (no $1 charge)
- Provision Twilio DID **only after** payment method is saved
- Sticky DID while subscribed + **30-day cancel grace** (keep number, disable screening webhooks)
- After grace: **release** DID (default) or optional paid hold (later)

## Flow
1. User signs up + completes onboarding (prefs saved, `provisioning_status=pending`)
2. App sends user to Stripe Checkout Session (`mode=subscription`, `trial_period_days=7`, `payment_method_collection=always`)
3. Stripe webhook `checkout.session.completed` / `customer.subscription.created` → store `stripe_customer_id`, `stripe_subscription_id`, `subscription_status=trialing`
4. On trial/active: call `provision-number` Edge Function → buy US voice number, set voice webhook to `twilio-voice-inbound`, save `phone_numbers.twilio_number`, `provisioning_status=active`
5. Customer Portal for cancel/update card
6. On `customer.subscription.deleted` / cancel at period end → enter grace (`subscription_status=grace`, `grace_ends_at=now()+30d`); stop screening or leave as-is until grace end
7. Grace job releases DID unless reactivated

## Stripe objects
- Product: Cove
- Price: $49/mo recurring USD
- Webhook endpoint: `/functions/v1/stripe-webhook`

## Env (Supabase secrets)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_49_MONTHLY`
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` (already used by voice fns)
- `VITE_STRIPE_PUBLISHABLE_KEY` (frontend)

## Tables
See migration `20260911000000_billing_fields.sql`
