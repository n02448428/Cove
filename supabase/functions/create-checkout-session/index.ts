// supabase/functions/create-checkout-session/index.ts
// Cove — Stripe Checkout Session (card-gated 7-day trial, $49/mo)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const PRICE_ID =
  Deno.env.get('STRIPE_PRICE_ID_49_MONTHLY') ?? 'price_1UEI7KBGpVuNZeuZ03lbTAtF'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') ?? 'https://withcove.co').replace(/\/$/, '')

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }
    if (!STRIPE_SECRET_KEY) {
      return json({ error: 'STRIPE_SECRET_KEY not configured' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing Authorization' }, 401)
    }

    // JWT-scoped client validates the user token
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // Service role for profile stripe_customer_id read/write
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('id, email, stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileErr || !profile) {
      return json({ error: 'Profile not found' }, 404)
    }

    let customerId = profile.stripe_customer_id as string | null

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email ?? user.email ?? undefined,
        metadata: { user_id: user.id, product: 'cove' },
      })
      customerId = customer.id
      const { error: updErr } = await admin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
      if (updErr) {
        console.error('Failed to save stripe_customer_id:', updErr)
        return json({ error: 'Failed to save customer' }, 500)
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { user_id: user.id, product: 'cove' },
      },
      payment_method_collection: 'always',
      // Do NOT set payment_method_types — let Stripe enable dynamic PM types
      metadata: { user_id: user.id, product: 'cove' },
      success_url: `${APP_BASE_URL}/forwarding?checkout=success`,
      cancel_url: `${APP_BASE_URL}/forwarding?checkout=canceled`,
      allow_promotion_codes: true,
    })

    if (!session.url) {
      return json({ error: 'Checkout session missing url' }, 500)
    }

    return json({ url: session.url })
  } catch (err) {
    console.error('create-checkout-session error:', err)
    return json({ error: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}