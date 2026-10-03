// supabase/functions/request-test-call/index.ts
// Cove — "Call me now" test call. Authenticated users only (verify_jwt = true).
// Places a Twilio call from the user's Cove number to their real number, routed
// through twilio-voice-inbound so they hear exactly what a caller hears.
// Abuse resistance: 3 test calls per user per rolling 24h.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createSupabase, fnUrl } from '../_shared/cove.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''

const MAX_PER_DAY = 3

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    // 1. Authenticate: resolve the user from their access token.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token || !SUPABASE_URL || !ANON_KEY) {
      return json({ error: 'Not authenticated' }, 401)
    }
    const anon = createClient(SUPABASE_URL, ANON_KEY)
    const { data: { user }, error: userErr } = await anon.auth.getUser(token)
    if (userErr || !user) {
      return json({ error: 'Not authenticated' }, 401)
    }

    const supabase = createSupabase()

    // 2. Look up the user's Cove number and real number.
    const { data: phoneRow } = await supabase
      .from('phone_numbers')
      .select('twilio_number, real_number')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!phoneRow?.twilio_number) {
      return json({ error: 'No Cove number yet — it may still be provisioning.' }, 409)
    }
    if (!phoneRow?.real_number) {
      return json({
        error: 'Add your real phone number in Settings first, so we know where to call.',
        code: 'REAL_NUMBER_MISSING',
      }, 409)
    }

    // 3. Rate limit: MAX_PER_DAY per rolling 24h.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count, error: countErr } = await supabase
      .from('test_call_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since)
    if (countErr) throw countErr
    if ((count ?? 0) >= MAX_PER_DAY) {
      return json({
        error: `Test-call limit reached (${MAX_PER_DAY} per day). Try again tomorrow.`,
        code: 'RATE_LIMITED',
      }, 429)
    }

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      return json({ error: 'Calling is not configured right now.' }, 503)
    }

    // 4. Place the call: Cove number -> real number, into the normal voice flow.
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: phoneRow.twilio_number,
          To: phoneRow.real_number,
          Url: fnUrl('twilio-voice-inbound'),
          Timeout: '30',
        }).toString(),
      },
    )
    const twilioData = await twilioRes.json().catch(() => ({}))
    if (!twilioRes.ok) {
      console.error('request-test-call: twilio error', twilioRes.status, JSON.stringify(twilioData).slice(0, 300))
      return json({ error: 'Could not place the call. Try again in a minute.' }, 502)
    }

    // 5. Record the request (best effort).
    await supabase.from('test_call_requests').insert({
      user_id: user.id,
      call_sid: twilioData.sid ?? null,
    })

    return json({
      ok: true,
      message: 'Calling you now — pick up to hear what your callers hear.',
      remaining: MAX_PER_DAY - (count ?? 0) - 1,
    })
  } catch (e) {
    console.error('request-test-call error:', e)
    return json({ error: 'Something went wrong. Try again.' }, 500)
  }
})
