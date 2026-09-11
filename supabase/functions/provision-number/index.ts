// supabase/functions/provision-number/index.ts
// Cove — buy US Twilio DID after PM saved; set voice webhook to twilio-voice-inbound

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_VOICE_WEBHOOK_URL =
  Deno.env.get('TWILIO_VOICE_WEBHOOK_URL') ??
  `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/twilio-voice-inbound`

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing Authorization' }, 401)
    }

    const body = await req.json().catch(() => ({})) as { user_id?: string }
    const userId = body.user_id
    if (!userId) {
      return json({ error: 'user_id required' }, 400)
    }

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      // Clear error — webhook callers should not crash hard on this
      return json({
        error: 'Twilio secrets missing',
        code: 'TWILIO_NOT_CONFIGURED',
        message: 'Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Edge Function secrets',
      }, 503)
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

    const { data: phoneRow, error: phoneErr } = await supabase
      .from('phone_numbers')
      .select('id, user_id, twilio_number, provisioning_status, real_number')
      .eq('user_id', userId)
      .maybeSingle()

    if (phoneErr) {
      console.error('phone_numbers lookup:', phoneErr)
      return json({ error: phoneErr.message }, 500)
    }

    if (
      phoneRow?.provisioning_status === 'active' &&
      phoneRow?.twilio_number
    ) {
      return json({
        ok: true,
        skipped: true,
        twilio_number: phoneRow.twilio_number,
      })
    }

    if (!phoneRow?.real_number) {
      return json({
        error: 'No phone_numbers row with real_number — complete onboarding first',
        code: 'ONBOARDING_INCOMPLETE',
      }, 400)
    }

    // Search available US local numbers (voice-capable)
    const searchUrl =
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/AvailablePhoneNumbers/US/Local.json?VoiceEnabled=true&Limit=1`
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Basic ${auth}` },
    })
    if (!searchRes.ok) {
      const t = await searchRes.text()
      console.error('Twilio search failed:', t)
      await markFailed(supabase, userId)
      return json({ error: 'Twilio number search failed', detail: t }, 502)
    }

    const searchData = await searchRes.json()
    const candidate = searchData?.available_phone_numbers?.[0]?.phone_number
    if (!candidate) {
      await markFailed(supabase, userId)
      return json({ error: 'No available US voice numbers', code: 'NO_NUMBERS' }, 502)
    }

    // Purchase + set voice URL
    const buyUrl =
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json`
    const buyRes = await fetch(buyUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        PhoneNumber: candidate,
        VoiceUrl: TWILIO_VOICE_WEBHOOK_URL,
        VoiceMethod: 'POST',
      }).toString(),
    })

    if (!buyRes.ok) {
      const t = await buyRes.text()
      console.error('Twilio buy failed:', t)
      await markFailed(supabase, userId)
      return json({ error: 'Twilio number purchase failed', detail: t }, 502)
    }

    const bought = await buyRes.json()
    const twilioNumber = bought.phone_number as string

    const { error: upsertErr } = await supabase
      .from('phone_numbers')
      .upsert({
        user_id: userId,
        real_number: phoneRow.real_number,
        twilio_number: twilioNumber,
        provisioning_status: 'active',
        released_at: null,
      }, { onConflict: 'user_id' })

    if (upsertErr) {
      console.error('phone_numbers upsert:', upsertErr)
      return json({
        error: 'Number bought but DB upsert failed',
        twilio_number: twilioNumber,
        detail: upsertErr.message,
      }, 500)
    }

    return json({ ok: true, twilio_number: twilioNumber })
  } catch (err) {
    console.error('provision-number error:', err)
    return json({ error: String(err) }, 500)
  }
})

async function markFailed(
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  await supabase
    .from('phone_numbers')
    .update({ provisioning_status: 'failed' })
    .eq('user_id', userId)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}