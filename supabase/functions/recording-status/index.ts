// supabase/functions/recording-status/index.ts
// Twilio RecordingStatusCallback for full-call recordings started via
// <Start><Recording> in the inbound TwiML. Stores the RecordingSid on the
// ticket so the dashboard can play the whole call.
//
// The callback fires when the call ends, so it also doubles as the hangup
// detector: a ticket still mid-screening is finalized here, and the
// completion dispatchers (webhook + notifications) are nudged — each gates
// on terminal transcripts, so nothing fires early.
// verify_jwt = false — Twilio signature validation instead.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import {
  createSupabase,
  formGet,
  audit,
  validateTwilioSignature,
  dispatchTicketWebhook,
  dispatchTicketNotifications,
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

    // Trace the callback hit itself (before validation) for diagnostics.
    try {
      const { data: t } = await supabase.from('review_tickets').select('user_id').eq('id', ticketId).maybeSingle()
      if (t?.user_id) {
        await audit(supabase, t.user_id, callSid, 'full_recording_callback_hit', 'twilio', {
          recording_sid: recordingSid || null,
          has_signature: !!req.headers.get('x-twilio-signature'),
        })
      }
    } catch (e) {
      console.error('recording-status trace failed:', e)
    }

    if (recordingSid && ticketId) {
      await supabase
        .from('review_tickets')
        .update({ full_recording_sid: recordingSid })
        .eq('id', ticketId)
      const { data: t } = await supabase
        .from('review_tickets')
        .select('user_id, status')
        .eq('id', ticketId)
        .maybeSingle()
      if (t) {
        await audit(supabase, t.user_id, callSid, 'full_recording_ready', 'twilio', {
          recording_sid: recordingSid,
        })
        // The call ended: if screening never finalized (caller hung up),
        // finalize now so the ticket is reviewable and notifiable.
        if (t.status === 'collecting' || t.status === 'transcribing') {
          const { data: fin } = await supabase
            .from('review_tickets')
            .update({ status: 'new', ended_reason: 'caller_hung_up' })
            .eq('id', ticketId)
            .in('status', ['collecting', 'transcribing'])
            .select('id')
          if (fin && fin.length > 0) {
            await audit(supabase, t.user_id, callSid, 'ticket_hung_up_finalized', 'kernel', {
              ticket_id: ticketId,
            })
          }
        }
        // Nudge completion dispatchers; each gates on terminal transcripts.
        dispatchTicketWebhook(supabase, ticketId)
        dispatchTicketNotifications(ticketId)
      }
    }
  } catch (e) {
    console.error('recording-status error:', e)
  }
  return new Response('OK')
})
