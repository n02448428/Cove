// supabase/functions/twilio-voice-inbound/index.ts
// Cove MVP - Inbound call webhook from Twilio
// Handles: trusted contact forwarding, Retell screening, fallback voicemail

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const RETELL_AGENT_ID = Deno.env.get('RETELL_AGENT_ID')!
const RETELL_API_KEY = Deno.env.get('RETELL_API_KEY')!
const APP_BASE_URL = Deno.env.get('APP_BASE_URL')!

serve(async (req: Request) => {
  try {
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

    // 3. Check if caller is a trusted contact
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

    // 4. Load screening rules for unknown caller
    const { data: rules } = await supabase
      .from('screening_rules')
      .select('urgent_keywords, block_keywords')
      .eq('user_id', user_id)
      .single()

    const urgentKeywords = rules?.urgent_keywords ?? []
    const blockKeywords = rules?.block_keywords ?? []
    const trustedNumbers = trustedContacts?.map(c => c.phone_number) ?? []

    // 5. Connect to Retell agent for screening
    // Pass dynamic context as custom data
    const retellContext = JSON.stringify({
      urgent_keywords: urgentKeywords,
      block_keywords: blockKeywords,
      trusted_numbers: trustedNumbers,
      caller_number: from,
      call_sid: callSid,
      user_id,
      real_number,
      webhook_url: `${APP_BASE_URL}/functions/v1/call-completion-handler`,
    })

    // Retell SIP integration via Twilio
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://api.retellai.com/audio-websocket/${RETELL_AGENT_ID}">
      <Parameter name="retell_llm_dynamic_variables" value='${retellContext.replace(/'/g, "&apos;")}'  />
    </Stream>
  </Connect>
</Response>`

    await supabase.from('call_logs').upsert({
      user_id,
      call_sid: callSid,
      status: 'screened',
      outcome: 'screened',
    }, { onConflict: 'call_sid' })

    await supabase.from('call_audit').insert({
      user_id, call_sid: callSid,
      event_type: 'retell_screening_started',
      provider: 'retell',
    })

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
