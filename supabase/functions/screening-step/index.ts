// supabase/functions/screening-step/index.ts
// Cove Call Kernel v0.1 — Yellow screening state machine.
// Stages:
//   code    -> validate private keypad code; valid => connect live; else silent => questions
//   question-> qi=0: greeting intro only (no recording), then -> qi=1;
//             qi=1..N: saved question spoken (with {name} substitution);
//             record the answer (transcribe async). No questions =>
//             unreachable mode: greeting, goodbye, hangup.
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
    if (!(await validateTwilioSignature(req, body, 'screening-step'))) {
      return new Response('Unauthorized', { status: 403 })
    }
  } catch (e) {
    console.error('sig validation error:', e)
  }

  const supabase = createSupabase()
  const stage = url.searchParams.get('stage') ?? ''
  const callSid = url.searchParams.get('callSid') ?? ''
  const ticketId = url.searchParams.get('ticketId') ?? ''
  // qi=0 is the Cove greeting; qi=1..N are the user's saved questions.
  // NOTE: parseInt may yield 0, so do NOT use `|| 1` here (it would remap 0 -> 1).
  const qiRaw = parseInt(url.searchParams.get('qi') ?? '0', 10)
  const qi = Number.isNaN(qiRaw) ? 0 : qiRaw
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

  // Load the user's custom greeting (dashboard-editable). {name} is
  // substituted with the display name at speak time. Falls back to the
  // default template if unset.
  let greetingTemplate = `Hello, this is Cove, {name}'s assistant. This call may be recorded. If you have an extension code, enter it while I'm still talking, followed by the pound key.`
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('greeting')
      .eq('id', user_id)
      .maybeSingle()
    if (prof?.greeting?.trim()) greetingTemplate = prof.greeting.trim()
  } catch {
    /* use default greeting */
  }
  // Substitute the {name} placeholder with the user's display name
  // (otherwise TTS reads the literal "{name}").
  const withName = (text) => (text ?? '').replace(/\{name\}/g, userName)

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

  // --------------------------------------------------- stage=emergency_connect
  // Triggered by call-transcribe when a transcript contains an emergency
  // keyword mid-call: the live call is redirected here via the Twilio REST
  // API, skipping the rest of screening and connecting immediately.
  // The ticket is flagged URGENT so the dashboard surfaces it prominently.
  if (stage === 'emergency_connect') {
    await supabase
      .from('review_tickets')
      .update({ status: 'actioned', ended_reason: 'completed', urgent: true })
      .eq('id', ticketId)
      .in('status', ['collecting', 'transcribing'])
    await logCall(supabase, callSid, user_id, {
      outcome: 'emergency_connected',
      status: 'emergency_connected',
      call_state: 'emergency_connected',
    })
    await audit(supabase, user_id, callSid, 'emergency_connected', 'kernel', {})

    if (real_number) {
      const statusCb = `${fnUrl('call-status')}?callSid=${encodeURIComponent(callSid)}&userId=${encodeURIComponent(user_id)}&source=emergency`
      return twiml(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This sounds urgent. Connecting you now.</Say>
  <Dial callerId="${xmlEscape(caller_number ?? '')}" action="${xmlEscape(statusCb)}" method="POST" timeout="30">
    <Number>${xmlEscape(real_number)}</Number>
  </Dial>
</Response>`,
      )
    }
    // No real number configured: end gracefully, ticket stays URGENT.
    return await finalize(supabase, callSid, ticketId, user_id, 'completed', 'screened', SCRIPT.thanksGoodbye)
  }


  // ------------------------------------------------------------ stage=question
  if (stage === 'question') {
    // qi=0 is the greeting: intro only, no recording. It plays, then the
    // call moves straight to Q1 (or goodbye if there are no questions).
    if (qi === 0) {
      const greetingText = withName(greetingTemplate)
      const codeAction = `${stepBase}?stage=code&qi=0&attempt=1&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
    // qi=0 is the greeting: intro only, no recording. The code instruction
      // lives inside the greeting speech itself, so code holders enter their
      // code WHILE Cove is talking — never in silence. The Gather's short
      // timeout only ever cuts silence: each keypress resets the clock, and
      // "#" submits immediately. Falls through to Q1 (or goodbye when there
      // are no questions) after a 1s beat.
      const q1Url = `${stepBase}?stage=question&qi=1&attempt=1&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
      return twiml(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" timeout="1" finishOnKey="#" action="${xmlEscape(codeAction)}" method="POST">
    <Say>${xmlEscape(greetingText)}</Say>
  </Gather>
  <Redirect method="POST">${xmlEscape(q1Url)}</Redirect>
</Response>`,
      )
    }
    // qi>=1 are the saved questions (recorded). Past the last: finalize.
    if (qi < 1 || qi > numQuestions) {
      return await finalize(supabase, callSid, ticketId, user_id, 'completed', 'screened', SCRIPT.thanksGoodbye)
    }
    // Every saved question is asked — the greeting never replaces one.
    const q = qs[qi - 1]
    const questionText = withName(q?.question ?? '')
    const answerAction = `${stepBase}?stage=answer&qi=${qi}&attempt=${attempt}&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
    const transcribeCb = `${fnUrl('call-transcribe')}?ticketId=${encodeURIComponent(ticketId)}&qi=${qi}&attempt=${attempt}`
    // The question is wrapped in a DTMF Gather so code holders can enter
    // their code at any point while the question is playing — pressing keys
    // interrupts the speech and jumps to code validation. After the speech,
    // a 1s beat (the caller's turn to start answering) falls through to
    // recording. The timeout is inter-digit: any keypress resets the clock,
    // so it only ever cuts silence, never someone mid-entry.
    // (DTMF cannot interrupt the <Record> itself — a Twilio limitation —
    // but the 2s silence timeout keeps that window short.)
    const codeAction = `${stepBase}?stage=code&qi=${qi}&attempt=${attempt}&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`

    return twiml(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" timeout="1" finishOnKey="#" action="${xmlEscape(codeAction)}" method="POST">
    <Say>${xmlEscape(questionText)}</Say>
  </Gather>
  <Record maxLength="60" timeout="2" playBeep="false" trim="trim-silence" transcribe="true" transcribeCallback="${xmlEscape(transcribeCb)}" action="${xmlEscape(answerAction)}" method="POST" />
</Response>`,
    )
  }

  // -------------------------------------------------------------- stage=answer
  if (stage === 'answer') {
    const recordingUrl = formGet(params, 'RecordingUrl')
    const recordingSid = formGet(params, 'RecordingSid')
    const durationStr = formGet(params, 'RecordingDuration')
    const duration = durationStr ? parseInt(durationStr, 10) : null
    // qi>=1 asked a saved question (qi=0 greeting has no recording).
    const q = qi >= 1 && qi <= numQuestions ? qs[qi - 1] : null
    const questionText = qi === 0 ? withName(greetingTemplate) : withName(q?.question ?? '')

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

    // Answer captured. Code holders get a natural moment AFTER speaking:
    // keypad presses can't interrupt the recording itself (Twilio), so the
    // instruction is spoken here and entry happens while Cove is talking.
    // The 2s timeout after the speech is inter-digit — any keypress resets
    // it, so it only ever cuts silence. Valid code connects live; anything
    // else advances (past the last question, stage=question finalizes).
    const isLast = qi >= numQuestions
    const nextQi = isLast ? numQuestions + 1 : qi + 1
    const nextQ = `${stepBase}?stage=question&qi=${nextQi}&attempt=1&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
    const codeAction = `${stepBase}?stage=code&qi=${nextQi}&attempt=1&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
    return twiml(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" timeout="2" finishOnKey="#" action="${xmlEscape(codeAction)}" method="POST">
    <Say>${xmlEscape(isLast ? SCRIPT.codePrompt : SCRIPT.thanksWithCode)}</Say>
  </Gather>
  <Redirect method="POST">${xmlEscape(nextQ)}</Redirect>
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
