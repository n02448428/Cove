// supabase/functions/call-status/index.ts
// Cove Call Kernel v0.2 — Twilio Dial action callback for live-connect calls
// (GREEN numbers). Reports whether the user's real number was reached. A
// missed connect takes a voicemail instead of ending the call.
// Source of truth: docs/Cove-Call-Kernel.md

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import {
  createSupabase,
  formGet,
  logCall,
  audit,
  validateTwilioSignature,
  fnUrl,
  twiml,
  xmlEscape,
  SCRIPT,
} from '../_shared/cove.ts'

serve(async (req: Request) => {
  const body = await req.text()
  const params = new URLSearchParams(body)
  const url = new URL(req.url)

  try {
    if (!(await validateTwilioSignature(req, body, 'call-status'))) {
      return new Response('Unauthorized', { status: 403 })
    }
  } catch (e) {
    console.error('sig validation error:', e)
  }

  const supabase = createSupabase()
  const callSid = url.searchParams.get('callSid') ?? formGet(params, 'CallSid')
  const userId = url.searchParams.get('userId') ?? ''
  const source = url.searchParams.get('source') ?? 'green'
  const dialStatus = formGet(params, 'DialCallStatus') // completed|no-answer|busy|failed|canceled

  const connected = dialStatus === 'completed' || dialStatus === 'in-progress'

  if (userId) {
    if (!connected) {
      // The live connect did not complete (user didn't pick up, busy, etc.).
      // Routing decision was still "connect live"; record the missed connect,
      // then take a voicemail so the caller is never met with silence.
      await logCall(supabase, callSid, userId, {
        outcome: 'failed',
        status: 'failed',
        call_state: 'failed',
        failure_reason: `dial_${dialStatus || 'unknown'}`,
      })
      await audit(supabase, userId, callSid, `dial_${dialStatus || 'unknown'}`, 'twilio', {
        source,
        connected,
      })
      const callerNumber = formGet(params, 'From') || null
      const { data: ticket } = await supabase
        .from('review_tickets')
        .insert({
          user_id: userId,
          call_sid: callSid,
          caller_number: callerNumber,
          status: 'collecting',
        })
        .select('id')
        .single()
      if (ticket) {
        const vmAction =
          `${fnUrl('screening-step')}?stage=voicemail` +
          `&callSid=${encodeURIComponent(callSid)}` +
          `&ticketId=${encodeURIComponent(ticket.id)}`
        const transcribeCb =
          `${fnUrl('call-transcribe')}?ticketId=${encodeURIComponent(ticket.id)}&qi=0&attempt=1`
        return twiml(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${xmlEscape(SCRIPT.voicemailMissed)}</Say>
  <Record maxLength="120" timeout="5" playBeep="true" trim="trim-silence" transcribe="true" transcribeCallback="${xmlEscape(transcribeCb)}" action="${xmlEscape(vmAction)}" method="POST" />
</Response>`,
        )
      }
    }
    if (connected) {
      await audit(supabase, userId, callSid, `dial_${dialStatus || 'unknown'}`, 'twilio', {
        source,
        connected,
      })
    }
  }

  // Connected (or nothing to do): the Dial leg is done.
  return new Response('OK', { status: 200 })
})
