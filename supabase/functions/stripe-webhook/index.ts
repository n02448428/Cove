// supabase/functions/stripe-webhook/index.ts
// Cove — Stripe webhook: subscription lifecycle + trigger DID provision
// Hardened: signature-first, event/state idempotency, defensive acks (no Edge deploy in this PR)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'
import { releaseExpiredDids } from '../_shared/releaseExpiredDids.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})
const cryptoProvider = Stripe.createSubtleCryptoProvider()

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

// In-memory idempotency for warm isolates (best-effort).
// Durable safety: handlers no-op when profile billing state already matches.
const seenEvents = new Set<string>()

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // --- Signature / raw body verification FIRST — never mutate before this ---
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET not set')
    return new Response('Webhook secret not configured', { status: 500 })
  }

  const signature = req.headers.get('Stripe-Signature')
  if (!signature) {
    return new Response('Missing Stripe-Signature', { status: 400 })
  }

  const body = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    // 400 — do not mutate; Stripe should not retry bad signatures forever as success
    return new Response(`Webhook Error: ${err}`, { status: 400 })
  }

  // Warm-isolate event-ID dedupe (mark after success so 5xx can retry)
  if (seenEvents.has(event.id)) {
    return json(200, { received: true, duplicate: true })
  }

  try {
    // Lazy DID release (post-grace) — await but soft-fail; never break webhook
    try {
      await releaseExpiredDids(supabase)
    } catch (e) {
      console.error('lazy releaseExpiredDids soft-fail:', e)
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break
      default:
        // ignore other events
        break
    }

    seenEvents.add(event.id)
    if (seenEvents.size > 500) {
      const first = seenEvents.values().next().value
      if (first) seenEvents.delete(first)
    }

    return json(200, { received: true })
  } catch (err) {
    console.error('stripe-webhook error:', err)
    // Transient/unexpected → 500 so Stripe retries.
    // Handlers ack missing customer/metadata with early return (200 path), not throw.
    return json(500, { error: String(err) })
  }
})

function isCoveMeta(meta: Stripe.Metadata | null | undefined): boolean {
  if (!meta || meta.product == null || meta.product === '') return true
  return meta.product === 'cove'
}

type ProfileBilling = {
  id: string
  subscription_status: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  grace_ends_at: string | null
  trial_ends_at: string | null
}

async function getProfileBilling(userId: string): Promise<ProfileBilling | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, subscription_status, stripe_customer_id, stripe_subscription_id, grace_ends_at, trial_ends_at',
    )
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('getProfileBilling failed:', error)
    throw error
  }
  return data as ProfileBilling | null
}

async function resolveUserId(opts: {
  userIdMeta?: string | null
  customerId?: string | null
  subscriptionId?: string | null
}): Promise<string | null> {
  if (opts.userIdMeta) return opts.userIdMeta

  if (opts.customerId) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('stripe_customer_id', opts.customerId)
      .maybeSingle()
    if (data?.id) return data.id
  }

  if (opts.subscriptionId) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('stripe_subscription_id', opts.subscriptionId)
      .maybeSingle()
    if (data?.id) return data.id
  }

  return null
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (!isCoveMeta(session.metadata)) {
    console.log('Ignoring non-cove checkout.session.completed')
    return
  }

  const customerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id

  if (!customerId && !session.metadata?.user_id) {
    // Non-retryable for Stripe: missing linkage — ack (200 via caller), do not mutate
    console.error('checkout.session.completed: missing customer and user_id metadata — ack no-op')
    return
  }

  const userId = await resolveUserId({
    userIdMeta: session.metadata?.user_id,
    customerId,
  })
  if (!userId) {
    // Non-retryable: unknown customer — log + ack (avoid infinite 5xx retries)
    console.error('checkout.session.completed: no user_id — ack no-op')
    return
  }

  // Prefer subscription status from Stripe if we can fetch it
  let status: string = 'trialing'
  let trialEndsAt: string | null = null
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      if (!isCoveMeta(sub.metadata) && sub.metadata?.product) {
        console.log('Ignoring non-cove subscription on checkout complete')
        return
      }
      status = mapStripeStatus(sub.status)
      if (sub.trial_end) {
        trialEndsAt = new Date(sub.trial_end * 1000).toISOString()
      }
    } catch (e) {
      console.error('Failed to retrieve subscription:', e)
    }
  }

  const existing = await getProfileBilling(userId)
  const idsMatch =
    (!customerId || existing?.stripe_customer_id === customerId) &&
    (!subscriptionId || existing?.stripe_subscription_id === subscriptionId)
  const statusMatch = existing?.subscription_status === status
  const trialMatch =
    !trialEndsAt || existing?.trial_ends_at === trialEndsAt

  if (existing && idsMatch && statusMatch && trialMatch) {
    console.log('checkout.session.completed: state already matches — no-op', userId, status)
    // Still ensure DID path if active/trialing (provision is idempotent)
    if (status === 'trialing' || status === 'active') {
      await triggerProvision(userId)
    }
    return
  }

  const patch: Record<string, unknown> = {}
  if (customerId) patch.stripe_customer_id = customerId
  if (subscriptionId) patch.stripe_subscription_id = subscriptionId
  patch.subscription_status = status
  if (trialEndsAt) patch.trial_ends_at = trialEndsAt
  if (status === 'trialing' || status === 'active') {
    patch.grace_ends_at = null
  }

  await supabase.from('profiles').update(patch).eq('id', userId)

  if (status === 'trialing' || status === 'active') {
    // Clear grace hold on phone_numbers if user reactivated
    await supabase
      .from('phone_numbers')
      .update({ reserved_until: null })
      .eq('user_id', userId)
    await triggerProvision(userId)
  }
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  if (!isCoveMeta(sub.metadata)) {
    console.log('Ignoring non-cove subscription event')
    return
  }

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  if (!customerId && !sub.metadata?.user_id) {
    console.error('subscription upsert: missing customer and user_id — ack no-op', sub.id)
    return
  }

  const userId = await resolveUserId({
    userIdMeta: sub.metadata?.user_id,
    customerId,
    subscriptionId: sub.id,
  })
  if (!userId) {
    console.error('subscription upsert: no user_id for', sub.id, '— ack no-op')
    return
  }

  const status = mapStripeStatus(sub.status)
  const trialEndsAt = sub.trial_end
    ? new Date(sub.trial_end * 1000).toISOString()
    : null

  const existing = await getProfileBilling(userId)
  const idsMatch =
    existing?.stripe_subscription_id === sub.id &&
    (!customerId || existing?.stripe_customer_id === customerId)
  const statusMatch = existing?.subscription_status === status
  const trialMatch = !trialEndsAt || existing?.trial_ends_at === trialEndsAt
  const graceCleared =
    status !== 'trialing' && status !== 'active'
      ? true
      : existing?.grace_ends_at == null

  if (existing && idsMatch && statusMatch && trialMatch && graceCleared) {
    console.log('subscription upsert: state already matches — no-op', sub.id, status)
    if (status === 'trialing' || status === 'active') {
      await triggerProvision(userId)
    }
    return
  }

  const patch: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    subscription_status: status,
  }
  if (customerId) patch.stripe_customer_id = customerId
  if (trialEndsAt) patch.trial_ends_at = trialEndsAt
  if (status === 'trialing' || status === 'active') {
    patch.grace_ends_at = null
  }

  // cancel_at_period_end → stay active until deleted; no grace yet
  if (sub.cancel_at_period_end && (status === 'active' || status === 'trialing')) {
    console.log(
      'subscription.updated: cancel_at_period_end set; staying',
      status,
      'until deleted',
      sub.id,
    )
  }

  await supabase.from('profiles').update(patch).eq('id', userId)

  if (status === 'trialing' || status === 'active') {
    await supabase
      .from('phone_numbers')
      .update({ reserved_until: null })
      .eq('user_id', userId)
    await triggerProvision(userId)
  }
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  if (!isCoveMeta(sub.metadata)) {
    console.log('Ignoring non-cove subscription.deleted')
    return
  }

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  const userId = await resolveUserId({
    userIdMeta: sub.metadata?.user_id,
    customerId,
    subscriptionId: sub.id,
  })
  if (!userId) {
    console.error('subscription.deleted: no user_id — ack no-op')
    return
  }

  const existing = await getProfileBilling(userId)
  // Idempotent: do NOT reset the 30d grace clock on Stripe retries
  if (
    existing?.subscription_status === 'grace' &&
    (existing.stripe_subscription_id === sub.id || !existing.stripe_subscription_id)
  ) {
    console.log('subscription.deleted: already grace — no-op (preserve grace_ends_at)', sub.id)
    return
  }

  const graceEnds = new Date()
  graceEnds.setDate(graceEnds.getDate() + 30)

  await supabase
    .from('profiles')
    .update({
      subscription_status: 'grace',
      grace_ends_at: graceEnds.toISOString(),
    })
    .eq('id', userId)

  // Hold DID during grace — keep Twilio DID; set reserved_until; do not release yet
  await supabase
    .from('phone_numbers')
    .update({ reserved_until: graceEnds.toISOString() })
    .eq('user_id', userId)
    .not('twilio_number', 'is', null)
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id

  if (!customerId && !subscriptionId) {
    console.error('invoice.payment_failed: missing customer and subscription — ack no-op')
    return
  }

  // Prefer subscription metadata when available
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      if (!isCoveMeta(sub.metadata)) {
        console.log('Ignoring non-cove invoice.payment_failed')
        return
      }
    } catch {
      // continue with customer lookup
    }
  }

  const userId = await resolveUserId({ customerId, subscriptionId })
  if (!userId) {
    console.error('invoice.payment_failed: no user_id — ack no-op')
    return
  }

  const existing = await getProfileBilling(userId)
  if (existing?.subscription_status === 'past_due') {
    console.log('invoice.payment_failed: already past_due — no-op', userId)
    return
  }

  // past_due only — do NOT release DID, do NOT touch phone_numbers / reserved_until
  await supabase
    .from('profiles')
    .update({ subscription_status: 'past_due' })
    .eq('id', userId)
}

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'unpaid':
      return 'canceled'
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return 'none'
    default:
      return 'none'
  }
}

async function triggerProvision(userId: string) {
  try {
    const res = await fetch(
      `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/provision-number`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId }),
      },
    )
    const text = await res.text()
    if (!res.ok) {
      // Soft-fail: do not throw so Stripe gets 200 after profile update
      // (Twilio missing secrets returns 503 with clear body)
      console.error('provision-number soft-fail:', res.status, text)
      return
    }
    console.log('provision-number ok:', text)
  } catch (e) {
    console.error('provision-number invoke error:', e)
  }
}
