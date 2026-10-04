// supabase/functions/recording-status/index.ts
// Twilio RecordingStatusCallback for full-call recordings started by
// startFullCallRecording (cove.ts). Stores the RecordingSid on the ticket
// so the dashboard can play the whole call.
// verify_jwt = false — Twilio signature validation instead.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import {
  createSupabase,
  formGet,
  audit,
  validateTwilioSignature,
} from '../_shared/cove.ts'

serve(async (req: Request) => {
  const body = await req.text()
  const params = new URLSearchParams(body)
  const url = new URL(req.url)

  try {
    if (!(await validateTwilioSignature(req, body, 'recording-status'))) {
      return new Response('Unauthorized', { status: 403 })
    }
  } catch (e) {
    console.error('sig validation error:', e)
  }

  try {
    const supabase = createSupabase()
    const recordingSid = formGet(params, 'RecordingSid')
    const callSid = formGet(params, 'CallSid')
    const ticketId = url.searchParams.get('ticketId') ?? ''

    if (recordingSid && ticketId) {
      await supabase
        .from('review_tickets')
        .update({ full_recording_sid: recordingSid })
        .eq('id', ticketId)
      const { data: t } = await supabase
        .from('review_tickets')
        .select('user_id')
        .eq('id', ticketId)
        .maybeSingle()
      if (t) {
        await audit(supabase, t.user_id, callSid, 'full_recording_ready', 'twilio', {
          recording_sid: recordingSid,
        })
      }
    }
  } catch (e) {
    console.error('recording-status error:', e)
  }
  return new Response('OK')
})
