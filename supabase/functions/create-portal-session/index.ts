// supabase/functions/create-portal-session/index.ts
// Cove — Stripe Customer Portal session (cancel / update card)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_BASE_URL = (
  Deno.env.get('FRONTEND_URL') ??
  Deno.env.get('CHECKOUT_RETURN_URL') ??
  'https://withcove.co'
).replace(/\/$/, '')

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

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('id, stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileErr || !profile) {
      return json({ error: 'Profile not found' }, 404)
    }

    const customerId = profile.stripe_customer_id as string | null
    if (!customerId) {
      return json({
        error: 'No Stripe customer — complete checkout first',
        code: 'NO_STRIPE_CUSTOMER',
      }, 400)
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_BASE_URL}/settings`,
    })

    if (!session.url) {
      return json({ error: 'Portal session missing url' }, 500)
    }

    return json({ url: session.url })
  } catch (err) {
    console.error('create-portal-session error:', err)
    return json({ error: String(err) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
