// supabase/functions/call-transcribe/index.ts
// Cove Call Kernel v0.1 — async Twilio transcription callback.
// Fills review_ticket_answers.transcript for a captured answer. Twilio sends
// this after the Record action callback, so transcripts arrive late.
// Source of truth: docs/Cove-Call-Kernel.md

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
    if (!(await validateTwilioSignature(req, body, 'call-transcribe'))) {
      return new Response('Unauthorized', { status: 403 })
    }
  } catch (e) {
    console.error('sig validation error:', e)
  }

  const supabase = createSupabase()
  const recordingSid = formGet(params, 'RecordingSid')
  const transcript = formGet(params, 'TranscriptionText')
  const transcriptionStatus = formGet(params, 'TranscriptionStatus') // completed|failed
  const ticketId = url.searchParams.get('ticketId') ?? ''
  const qi = parseInt(url.searchParams.get('qi') ?? '0', 10) || 0
  const attempt = parseInt(url.searchParams.get('attempt') ?? '0', 10) || 0

  // Locate the answer row by recording_sid (preferred), else by ticket+ord+attempt.
  let query = supabase
    .from('review_ticket_answers')
    .update({
      transcript: transcript || null,
      transcription_status: transcriptionStatus || (transcript ? 'completed' : 'failed'),
    })

  if (recordingSid) {
    query = query.eq('recording_sid', recordingSid)
  } else {
    query = query.eq('ticket_id', ticketId).eq('question_ord', qi).eq('attempt', attempt)
  }

  const { error } = await query
  if (error) {
    console.error('transcribe update error:', error)
    return new Response('error', { status: 500 })
  }

  // Best-effort audit (ticket -> user lookup).
  if (ticketId) {
    const { data: ticket } = await supabase
      .from('review_tickets')
      .select('user_id, call_sid')
      .eq('id', ticketId)
      .maybeSingle()
    if (ticket) {
      await audit(supabase, ticket.user_id, ticket.call_sid, 'transcription_received', 'twilio', {
        question_ord: qi,
        status: transcriptionStatus,
      })
    }
  }

  return new Response('OK', { status: 200 })
})
