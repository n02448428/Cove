// supabase/functions/twilio-voice-inbound/index.ts
// Cove Call Kernel v0.2 — inbound call entry point.
// RED number -> Reject. GREEN number -> Connect live. All others -> Yellow
// (question loop via screening-step).
// Source of truth: docs/Cove-Call-Kernel.md

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import {
  createSupabase,
  fnUrl,
  parseForm,
  formGet,
  logCall,
  audit,
  twiml,
  xmlEscape,
  validateTwilioSignature,
  SCRIPT,
} from '../_shared/cove.ts'

serve(async (req: Request) => {
  const body = await req.text()
  const params = new URLSearchParams(body)

  // Twilio signature validation (no-op when no auth token configured).
  try {
    if (!(await validateTwilioSignature(req, body, 'twilio-voice-inbound'))) {
      return new Response('Unauthorized', { status: 403 })
    }
  } catch (e) {
    console.error('sig validation error:', e)
  }

  try {
    const to = formGet(params, 'To')
    const from = formGet(params, 'From')
    const callSid = formGet(params, 'CallSid')

    const supabase = createSupabase()

    // 1. Look up the Cove user that owns this concierge number.
    const { data: phoneRow, error: phoneErr } = await supabase
      .from('phone_numbers')
      .select('user_id, real_number')
      .eq('twilio_number', to)
      .maybeSingle()

    if (phoneErr || !phoneRow) {
      return twiml(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${xmlEscape(SCRIPT.notConfigured)}</Say><Hangup/></Response>`,
      )
    }

    const { user_id, real_number } = phoneRow

    // 2. Log call receipt (idempotent on call_sid).
    await logCall(supabase, callSid, user_id, {
      caller_number: from,
      outcome: 'received',
      status: 'received',
      call_state: 'received',
    })
    await audit(supabase, user_id, callSid, 'inbound_received', 'twilio', { to, from })

    // 3. RED overrides GREEN: check RED first.
    const { data: redRow } = await supabase
      .from('caller_lists')
      .select('id, contact_name')
      .eq('user_id', user_id)
      .eq('phone_number', from)
      .eq('classification', 'red')
      .maybeSingle()

    if (redRow) {
      await logCall(supabase, callSid, user_id, {
        outcome: 'rejected',
        status: 'rejected',
        call_state: 'rejected',
      })
      await audit(supabase, user_id, callSid, 'red_rejected', 'kernel', {
        contact_name: redRow.contact_name,
      })
      return twiml('<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>')
    }

    // 4. GREEN: connect live to the user's real number.
    const { data: greenRow } = await supabase
      .from('caller_lists')
      .select('id, contact_name')
      .eq('user_id', user_id)
      .eq('phone_number', from)
      .eq('classification', 'green')
      .maybeSingle()

    if (greenRow) {
      // Kernel v0.4: GREEN bypasses screening. Take a message, classify as
      // CUSTOMER, ticket, email per settings. No live dial.
      await audit(supabase, user_id, callSid, 'green_message', 'kernel', {
        contact_name: greenRow.contact_name,
      })
      const { data: greenTicket } = await supabase
        .from('review_tickets')
        .insert({
          user_id,
          call_sid: callSid,
          caller_number: from,
          status: 'collecting',
          classification: 'CUSTOMER',
        })
        .select('id')
        .single()
      if (greenTicket) {
        await logCall(supabase, callSid, user_id, {
          ticket_id: greenTicket.id,
          outcome: 'green_message',
          status: 'green_message',
          call_state: 'green_message',
        })
        const vmAction =
          `${fnUrl('screening-step')}?stage=voicemail` +
          `&callSid=${encodeURIComponent(callSid)}` +
          `&ticketId=${encodeURIComponent(greenTicket.id)}`
        const transcribeCb =
          `${fnUrl('call-transcribe')}?ticketId=${encodeURIComponent(greenTicket.id)}&qi=0&attempt=1`
        return twiml(
          `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>Please leave your message.</Say>\n  <Record maxLength="120" timeout="5" playBeep="true" trim="trim-silence" transcribe="true" transcribeCallback="${xmlEscape(transcribeCb)}" action="${xmlEscape(vmAction)}" method="POST" />\n</Response>`,
        )
      }
      return twiml(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${xmlEscape(SCRIPT.notConfigured)}</Say><Hangup/></Response>`,
      )
    }

    // 5. YELLOW: create a review ticket, then start the question loop
    //    at the greeting (qi=0).
    const { data: ticket, error: ticketErr } = await supabase
      .from('review_tickets')
      .insert({
        user_id,
        call_sid: callSid,
        caller_number: from,
        status: 'collecting',
      })
      .select('id')
      .single()

    const ticketId = ticket?.id ?? ''

    await logCall(supabase, callSid, user_id, {
      ticket_id: ticketId || null,
      outcome: 'screening',
      status: 'screening',
      call_state: 'screening',
    })
    await audit(supabase, user_id, callSid, 'yellow_started', 'kernel', {
      ticket_id: ticketId,
      ticket_error: ticketErr ? String(ticketErr) : null,
    })

    // Display name for the spoken greeting: the user's explicit setting
    // first, email prefix as a fallback, 'there' as a last resort.
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, display_name')
      .eq('id', user_id)
      .maybeSingle()
    const emailName = profile?.email
      ? (profile.email.split('@')[0] || '').replace(/[0-9]+$/, '').replace(/^./, (c: string) => c.toUpperCase())
      : ''
    const userName = profile?.display_name?.trim() || emailName || 'there'

    const stepBase = `${fnUrl('screening-step')}`
    // Redirect to the greeting (qi=0); saved questions are qi=1..N.
    const questionRedirect = `${stepBase}?stage=question&qi=0&attempt=1&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`

    // Per-answer recordings (in screening-step) capture all caller speech.
    // No full-call recording: saves Twilio storage costs, per-answer is sufficient.
    return twiml(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${xmlEscape(questionRedirect)}</Redirect></Response>`,
    )
  } catch (err) {
    console.error('twilio-voice-inbound error:', err)
    return twiml(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${xmlEscape(SCRIPT.notConfigured)}</Say><Hangup/></Response>`,
    )
  }
})
