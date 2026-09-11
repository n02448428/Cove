// supabase/functions/twilio-voice-inbound/index.ts
// Cove MVP - Inbound call webhook from Twilio
// Handles: trusted contact forwarding, DTMF Gather screening, fallback voicemail
// Retell removed from hot path (unknown callers → Gather → twilio-voice-screen)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { releaseExpiredDids } from '../_shared/releaseExpiredDids.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Prod historically omitted APP_BASE_URL — never emit undefined action URLs
const APP_BASE_URL = (
  Deno.env.get('APP_BASE_URL') ?? 'https://csbstpehuunaoyehhixp.supabase.co'
).replace(/\/$/, '')

serve(async (req: Request) => {
  try {
    // Lazy DID release (post-grace) — minimal touch; then existing screening path
    try {
      await releaseExpiredDids(supabase)
    } catch (e) {
      console.error('lazy releaseExpiredDids soft-fail:', e)
    }

    const body = await req.text()
    const params = new URLSearchParams(body)
    const to = params.get('To') ?? ''
    const from = params.get('From') ?? ''
    const callSid = params.get('CallSid') ?? ''

    // 1. Look up user by twilio_number
    const { data: phoneRow, error: phoneErr } = await supabase
      .from('phone_numbers')
      .select('user_id, real_number')
      .eq('twilio_number', to)
      .single()

    if (phoneErr || !phoneRow) {
      console.error('No user found for twilio_number:', to)
      return fallbackVoicemail(callSid, null, 'no_user_found')
    }

    const { user_id, real_number } = phoneRow

    // 2. Log initial call receipt
    await supabase.from('call_logs').upsert({
      user_id,
      call_sid: callSid,
      caller_number: from,
      status: 'received',
      outcome: 'received',
    }, { onConflict: 'call_sid' })

    await supabase.from('call_audit').insert({
      user_id,
      call_sid: callSid,
      event_type: 'inbound_received',
      payload: { to, from },
      provider: 'twilio',
    })

    // 3. Check if caller is a trusted contact (exact From match)
    const { data: trustedContacts } = await supabase
      .from('trusted_contacts')
      .select('phone_number, contact_name')
      .eq('user_id', user_id)

    const trustedMatch = trustedContacts?.find(c => c.phone_number === from)

    if (trustedMatch) {
      // Trusted contact: forward directly to real number
      await supabase.from('call_audit').insert({
        user_id, call_sid: callSid,
        event_type: 'trusted_contact_forward',
        payload: { contact_name: trustedMatch.contact_name },
        provider: 'twilio',
      })

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${from}" action="${APP_BASE_URL}/functions/v1/call-completion-handler?userId=${user_id}&amp;callSid=${callSid}&amp;outcome=forwarded">
    <Number>${real_number}</Number>
  </Dial>
</Response>`
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })
    }

    // 4. Unknown caller: DTMF Gather → twilio-voice-screen (no Retell)
    await supabase.from('call_logs').upsert({
      user_id,
      call_sid: callSid,
      status: 'screened',
      outcome: 'screened',
    }, { onConflict: 'call_sid' })

    await supabase.from('call_audit').insert({
      user_id, call_sid: callSid,
      event_type: 'dtmf_screening_started',
      provider: 'twilio',
    })

    const screenAction =
      `${APP_BASE_URL}/functions/v1/twilio-voice-screen?callSid=${encodeURIComponent(callSid)}`

    // Prompt matches screen contract: 9 urgent / 1 sales / else voicemail
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" timeout="6" action="${screenAction}" method="POST">
    <Say>Thanks for calling. If this is urgent, press 9. If you are a salesperson, press 1. Otherwise, stay on the line to leave a message.</Say>
  </Gather>
  <Say>Please leave your message after the beep.</Say>
  <Record maxLength="120" playBeep="true" timeout="30" transcribe="true" transcribeCallback="${APP_BASE_URL}/functions/v1/call-completion-handler?outcome=voicemail&amp;callSid=${callSid}" />
</Response>`

    return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('twilio-voice-inbound error:', err)
    return fallbackVoicemail('', null, String(err))
  }
})

function fallbackVoicemail(callSid: string, userId: string | null, reason: string): Response {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We are unable to take your call right now. Please leave a message after the beep.</Say>
  <Record maxLength="120" transcribe="true" transcribeCallback="${APP_BASE_URL}/functions/v1/call-completion-handler?outcome=voicemail&amp;callSid=${callSid}" />
</Response>`
  return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })
}
