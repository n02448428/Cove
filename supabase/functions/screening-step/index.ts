// supabase/functions/screening-step/index.ts
// Cove Call Kernel v0.1 — Yellow screening state machine.
// Stages:
//   code    -> validate private keypad code; valid => connect live; else silent => questions
//   question-> speak saved question[qi], record the answer (transcribe async)
//   answer  -> capture recording; no-answer repeats once, then goodbye; else thank + next/final
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
  NO_ANSWER_DURATION_S,
} from '../_shared/cove.ts'

const TERMINAL = ['new', 'reviewed', 'actioned', 'failed']

serve(async (req: Request) => {
  const body = await req.text()
  const params = new URLSearchParams(body)
  const url = new URL(req.url)

  try {
    if (!(await validateTwilioSignature(req, body))) {
      return new Response('Unauthorized', { status: 403 })
    }
  } catch (e) {
    console.error('sig validation error:', e)
  }

  const supabase = createSupabase()
  const stage = url.searchParams.get('stage') ?? ''
  const callSid = url.searchParams.get('callSid') ?? ''
  const ticketId = url.searchParams.get('ticketId') ?? ''
  const qi = parseInt(url.searchParams.get('qi') ?? '1', 10) || 1
  const attempt = parseInt(url.searchParams.get('attempt') ?? '1', 10) || 1
  const userName = url.searchParams.get('name') ?? 'there'

  // Resolve ticket + user + real number once.
  const { data: ticket } = await supabase
    .from('review_tickets')
    .select('id, user_id, status, caller_number')
    .eq('id', ticketId)
    .maybeSingle()

  if (!ticket) {
    return twiml('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>')
  }
  const { user_id, caller_number } = ticket

  // If this ticket is already terminal, no-op (idempotent duplicate callback).
  if (TERMINAL.includes(ticket.status)) {
    return twiml('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
  }

  // Load the user's real number + saved questions (ordered).
  const [{ data: phoneRow }, { data: questions }] = await Promise.all([
    supabase.from('phone_numbers').select('real_number').eq('user_id', user_id).maybeSingle(),
    supabase
      .from('screening_questions')
      .select('ord, question')
      .eq('user_id', user_id)
      .order('ord', { ascending: true }),
  ])

  const real_number = phoneRow?.real_number ?? ''
  const qs = (questions ?? []).sort((a, b) => a.ord - b.ord)
  const numQuestions = qs.length
  const stepBase = `${fnUrl('screening-step')}`

  // ---------------------------------------------------------------- stage=code
  if (stage === 'code') {
    const digits = formGet(params, 'Digits')
    let codeValid = false
    if (digits) {
      const { data: codeRows } = await supabase
        .from('access_codes')
        .select('id, label')
        .eq('user_id', user_id)
        .eq('code', digits)
        .is('revoked_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .limit(1)
      const codeRow = codeRows?.[0] ?? null
      if (codeRow) {
        codeValid = true
        await supabase
          .from('access_codes')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', codeRow.id)
        // A valid code connects live; the screening ticket is closed as
        // actioned (no question loop, no review needed).
        await supabase
          .from('review_tickets')
          .update({ status: 'actioned', ended_reason: 'completed' })
          .eq('id', ticketId)
          .in('status', ['collecting', 'transcribing'])
        await logCall(supabase, callSid, user_id, {
          outcome: 'code_connected',
          status: 'code_connected',
          call_state: 'code_connected',
        })
        await audit(supabase, user_id, callSid, 'code_connected', 'kernel', {
          label: codeRow.label,
        })
      } else {
        await audit(supabase, user_id, callSid, 'code_invalid', 'kernel', {})
      }
    }

    if (codeValid && real_number) {
      const statusCb = `${fnUrl('call-status')}?callSid=${encodeURIComponent(callSid)}&userId=${encodeURIComponent(user_id)}&source=code`
      return twiml(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${xmlEscape(caller_number ?? '')}" action="${xmlEscape(statusCb)}" method="POST" timeout="30">
    <Number>${xmlEscape(real_number)}</Number>
  </Dial>
</Response>`,
      )
    }

    // Invalid / no code: return to the current question.
    const qiParam = url.searchParams.get('qi') ?? '1'
    const attemptParam = url.searchParams.get('attempt') ?? '1'
    const qUrl = `${stepBase}?stage=question&qi=${qiParam}&attempt=${attemptParam}&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
    return twiml(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${xmlEscape(qUrl)}</Redirect></Response>`,
    )
  }

  // ------------------------------------------------------------ stage=question
  if (stage === 'question') {
    // No questions configured, or past the last question: finalize.
    if (numQuestions === 0 || qi > numQuestions) {
      return await finalize(supabase, callSid, ticketId, user_id, 'completed', 'screened', SCRIPT.thanksGoodbye)
    }
    const q = qs[qi - 1]
    // First question is always the Cove greeting with the user's name.
    const questionText = qi === 1
      ? `Hello, this is Cove, ${userName}'s assistant. Please state your name and reason for calling.`
      : q.question
    const answerAction = `${stepBase}?stage=answer&qi=${qi}&attempt=${attempt}&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
    const transcribeCb = `${fnUrl('call-transcribe')}?ticketId=${encodeURIComponent(ticketId)}&qi=${qi}&attempt=${attempt}`
    // Brief DTMF Gather before the Record so code holders can enter their
    // code at any point during screening. 1s timeout, falls through to question.
    const codeAction = `${stepBase}?stage=code&qi=${qi}&attempt=${attempt}&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`

    return twiml(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" timeout="1" finishOnKey="#" action="${xmlEscape(codeAction)}" method="POST">
  </Gather>
  <Say>${xmlEscape(questionText)}</Say>
  <Record maxLength="60" timeout="4" playBeep="false" trim="trim-silence" transcribe="true" transcribeCallback="${xmlEscape(transcribeCb)}" action="${xmlEscape(answerAction)}" method="POST" />
</Response>`,
    )
  }

  // -------------------------------------------------------------- stage=answer
  if (stage === 'answer') {
    const recordingUrl = formGet(params, 'RecordingUrl')
    const recordingSid = formGet(params, 'RecordingSid')
    const durationStr = formGet(params, 'RecordingDuration')
    const duration = durationStr ? parseInt(durationStr, 10) : null
    const q = numQuestions >= qi ? qs[qi - 1] : null
    const questionText = q?.question ?? ''

    const noAnswer = !recordingSid || (duration !== null && duration < NO_ANSWER_DURATION_S)

    // Persist the captured answer (idempotent on ticket+ord+attempt).
    await supabase.from('review_ticket_answers').upsert(
      {
        ticket_id: ticketId,
        question_ord: qi,
        attempt,
        question_text: questionText,
        recording_sid: recordingSid || null,
        recording_url: recordingUrl || null,
        recording_duration: duration,
        transcript: null,
        transcription_status: noAnswer ? 'none' : 'pending',
      },
      { onConflict: 'ticket_id,question_ord,attempt' },
    )

    if (noAnswer) {
      if (attempt < 2) {
        // Repeat the same question once.
        const repeat = `${stepBase}?stage=question&qi=${qi}&attempt=2&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
        return twiml(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${xmlEscape(repeat)}</Redirect></Response>`,
        )
      }
      // Second miss: end the call.
      return await finalize(
        supabase, callSid, ticketId, user_id, 'no_answer', 'no_answer',
        SCRIPT.noAnswer,
      )
    }

    // Answer captured. Thank the caller, then advance or close.
    const isLast = qi >= numQuestions
    if (isLast) {
      return await finalize(
        supabase, callSid, ticketId, user_id, 'completed', 'screened',
        SCRIPT.thanksGoodbye,
      )
    }

    const next = `${stepBase}?stage=question&qi=${qi + 1}&attempt=1&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
    return twiml(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${xmlEscape(SCRIPT.thanks)}</Say>
  <Redirect method="POST">${xmlEscape(next)}</Redirect>
</Response>`,
    )
  }

  // Unknown stage.
  return twiml('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>')
})

// Finalize the ticket: speak the closing script, hang up, mark ticket + call log.
async function finalize(
  supabase: ReturnType<typeof createSupabase>,
  callSid: string,
  ticketId: string,
  userId: string,
  endedReason: 'completed' | 'no_answer' | 'caller_hung_up' | 'failed',
  callOutcome: string,
  closingScript: string,
): Promise<Response> {
  await supabase
    .from('review_tickets')
    .update({ status: 'new', ended_reason: endedReason })
    .eq('id', ticketId)
    .in('status', ['collecting', 'transcribing'])

  await logCall(supabase, callSid, userId, {
    outcome: callOutcome,
    status: callOutcome,
    call_state: callOutcome,
  })
  await audit(supabase, userId, callSid, `ticket_${endedReason}`, 'kernel', { ticket_id: ticketId })

  return twiml(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${xmlEscape(closingScript)}</Say><Hangup/></Response>`,
  )
}
