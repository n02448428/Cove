// supabase/functions/twilio-voice-screen/index.ts
// Cove MVP - DTMF screening callback from Twilio Gather
// Digits 9 → Dial real_number; 1 → hangup sales; else/timeout → Record voicemail
// Source reconstructed from deployed ACTIVE v5 (project csbstpehuunaoyehhixp)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY =
  Deno.env.get('COVE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!SERVICE_ROLE_KEY) throw new Error('Missing COVE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function twiml(xml: string): Response {
  return new Response(xml, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

function safe(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v : ''
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

    const url = new URL(req.url)
    const callSid = url.searchParams.get('callSid') ?? ''
    const body = await req.formData()
    const digits = safe(body.get('Digits'))
    const from = safe(body.get('From'))
    const to = safe(body.get('To'))

    const { data: phoneRow } = await supabase
      .from('phone_numbers')
      .select('user_id, real_number')
      .eq('twilio_number', to)
      .maybeSingle()

    if (!phoneRow) {
      return twiml(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number is not configured yet.</Say></Response>`,
      )
    }

    // Press 9 -> urgent, forward immediately
    if (digits === '9') {
      await supabase
        .from('call_logs')
        .update({
          outcome: 'forwarded',
          status: 'forwarded',
          summary: 'Caller marked call as urgent (pressed 9)',
        })
        .eq('call_sid', callSid)

      return twiml(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thanks, connecting you now.</Say><Dial callerId="${from}">${phoneRow.real_number}</Dial></Response>`,
      )
    }

    // Press 1 -> sales/solicitation, politely end call
    if (digits === '1') {
      await supabase
        .from('call_logs')
        .update({
          outcome: 'blocked',
          status: 'blocked',
          summary: 'Caller identified as sales/solicitation',
        })
        .eq('call_sid', callSid)

      return twiml(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Thanks for calling. We are not interested at this time. Have a great day.</Say><Hangup/></Response>`,
      )
    }

    // Press 2, timeout, or anything else -> voicemail
    await supabase
      .from('call_logs')
      .update({
        outcome: 'voicemail',
        status: 'voicemail_pending',
      })
      .eq('call_sid', callSid)

    const recordAction = `${SUPABASE_URL}/functions/v1/twilio-status-callback?state=recording`
    return twiml(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Please leave your message after the beep.</Say><Record playBeep="true" timeout="30" action="${recordAction}" /></Response>`,
    )
  } catch (e) {
    console.error('screen error:', e)
    return twiml(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>I'm sorry, something went wrong. Please try again later.</Say></Response>`,
    )
  }
})
