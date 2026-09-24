// supabase/functions/call-status/index.ts
// Cove Call Kernel v0.1 — Twilio Dial action callback for live-connect calls
// (GREEN numbers + valid keypad codes). Reports whether the user's real number
// was reached. Kernel has no voicemail, so a no-answer simply ends the call.
// Source of truth: docs/Cove-Call-Kernel.md

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import {
  createSupabase,
  formGet,
  logCall,
  audit,
  validateTwilioSignature,
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
  const source = url.searchParams.get('source') ?? 'green' // green | code
  const dialStatus = formGet(params, 'DialCallStatus') // completed|no-answer|busy|failed|canceled

  const connected = dialStatus === 'completed' || dialStatus === 'in-progress'

  if (userId) {
    if (!connected) {
      // The live connect did not complete (user didn't pick up, busy, etc.).
      // Routing decision was still "connect live"; record the missed connect.
      await logCall(supabase, callSid, userId, {
        outcome: 'failed',
        status: 'failed',
        call_state: 'failed',
        failure_reason: `dial_${dialStatus || 'unknown'}`,
      })
    }
    await audit(supabase, userId, callSid, `dial_${dialStatus || 'unknown'}`, 'twilio', {
      source,
      connected,
    })
  }

  // No further TwiML needed; the Dial leg is done.
  return new Response('OK', { status: 200 })
})
