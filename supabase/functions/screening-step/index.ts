// supabase/functions/screening-step/index.ts
// Cove Call Kernel v0.2 — Yellow screening state machine.
// Stages:
//   question-> qi=0: greeting intro only (no recording), then -> qi=1;
//             qi=1..N: saved question spoken (with {name} substitution);
//             record the answer (transcribe async). No questions =>
//             unreachable mode: greeting, then take a voicemail message.
//   answer  -> capture recording; no-answer repeats once, then goodbye; else thank + next/final
//   voicemail -> Record action callback: missed live-connect or unreachable
//             mode; store the message, finalize the ticket.
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
  containsEmergencyKeyword,
  dispatchTicketWebhook,
  dispatchTicketNotifications,
} from '../_shared/cove.ts'

const TERMINAL = ['new', 'reviewed', 'actioned', 'failed']

// Cove's voice: pre-generated ElevenLabs audio (Jessica), cached as static
// files. Known texts play the recording; anything new falls back to <Say>
// until its audio is generated.
const VOICE_BASE = 'https://www.withcove.co/voice'
const VOICE_FILES: Record<string, string> = {
  "Hello \u2014 you've reached Dmitry. I'm Cove, his AI receptionist. This call may be recorded.": 'paige_greeting.mp3',
  'May I ask who is calling, and what I can help you with?': 'paige_q1.mp3',
  'What\u2019s the best number to reach you back on?': 'paige_q2.mp3',
  'Thank you. I will pass this along. Goodbye from Cove.': 'paige_goodbye.mp3',
  'No answer. Goodbye.': 'paige_noanswer.mp3',
  'Please leave a message after the tone.': 'paige_voicemail.mp3',
  "Sorry, I didn't quite catch that.": 'paige_sorry.mp3',
}
function speak(text: string): string {
  const f = VOICE_FILES[text]
  return f ? `<Play>${xmlEscape(`${VOICE_BASE}/${f}`)}</Play>` : `<Say>${xmlEscape(text)}</Say>`
}

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
  let greetingTemplate = `Hello, this is Cove, {name}'s assistant. This call may be recorded.`
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

  // ------------------------------------------------------------ stage=question
  if (stage === 'question') {
    // qi=0 is the greeting: intro only, no recording. It plays, then the
    // call moves straight to Q1 (or to a voicemail prompt when there are
    // no questions).
    if (qi === 0) {
      const greetingText = withName(greetingTemplate)
      if (numQuestions === 0) {
        // Unreachable mode: no screening questions — take a message instead
        // of hanging up. The message is transcribed and ticketed like any
        // answer, so nothing the caller says is ever lost.
        const vmAction = `${stepBase}?stage=voicemail&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
        const transcribeCb = `${fnUrl('call-transcribe')}?ticketId=${encodeURIComponent(ticketId)}&qi=0&attempt=1`
        return twiml(
          `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speak(greetingText)}
  ${speak(SCRIPT.voicemailPrompt)}
  <Record maxLength="120" timeout="5" playBeep="true" trim="trim-silence" transcribe="true" transcribeCallback="${xmlEscape(transcribeCb)}" action="${xmlEscape(vmAction)}" method="POST" />
</Response>`,
        )
      }
      // The greeting plays once: intro only, no recording. Falls through to Q1.
      const q1Url = `${stepBase}?stage=question&qi=1&attempt=1&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
      return twiml(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speak(greetingText)}
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
    // On a misfire retry, Paige excuses herself before repeating the question.
    const sorryPrefix = url.searchParams.get('sorry') === '1' ? `${speak("Sorry, I didn't quite catch that.")}\n  ` : ''
    // Speech gather with automatic end-of-speech detection: the moment the
    // caller stops talking, Twilio moves on. No silence-timeout guessing.
    // Full-call audio is captured separately by <Start><Recording>.
    return twiml(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" speechTimeout="auto" timeout="8" action="${xmlEscape(answerAction)}" method="POST">
    ${sorryPrefix}${speak(questionText)}
  </Gather>
  <Redirect method="POST">${xmlEscape(answerAction)}</Redirect>
</Response>`,
    )
  }

  // -------------------------------------------------------------- stage=answer
  if (stage === 'answer') {
    const speechResult = (formGet(params, 'SpeechResult') || '').trim()
    const confidence = parseFloat(formGet(params, 'Confidence') || '1')
    // qi>=1 asked a saved question (qi=0 greeting has no gather).
    const q = qi >= 1 && qi <= numQuestions ? qs[qi - 1] : null
    const questionText = qi === 0 ? withName(greetingTemplate) : withName(q?.question ?? '')

    // A barge-in that caught only a cough or fragment comes back with very
    // low confidence — treat it as if they didn't answer so the question
    // repeats instead of their noise becoming the answer.
    const misfire = !!speechResult && (confidence < 0.4 || speechResult.length < 2)
    const noAnswer = !speechResult || misfire

    // Persist the captured answer (idempotent on ticket+ord+attempt).
    // Transcript arrives with the answer — no async transcription needed.
    // Misfires save nothing; the question simply repeats.
    await supabase.from('review_ticket_answers').upsert(
      {
        ticket_id: ticketId,
        question_ord: qi,
        attempt,
        question_text: questionText,
        recording_sid: null,
        recording_url: null,
        recording_duration: null,
        transcript: misfire ? null : speechResult || null,
        transcription_status: noAnswer ? 'none' : 'completed',
      },
      { onConflict: 'ticket_id,question_ord,attempt' },
    )

    if (!noAnswer) {
      await audit(supabase, user_id, callSid, 'transcription_received', 'twilio', {
        question_ord: qi,
        status: 'completed',
      })
      // Emergency path: a keyword match flags the ticket URGENT so the user
      // is notified immediately and can call back. The live call is never
      // pulled out of screening on a caller's word alone.
      const { data: prof } = await supabase
        .from('profiles')
        .select('urgent_keywords')
        .eq('id', user_id)
        .maybeSingle()
      const { data: tkt } = await supabase
        .from('review_tickets')
        .select('urgent, status')
        .eq('id', ticketId)
        .maybeSingle()
      if (
        containsEmergencyKeyword(speechResult, prof?.urgent_keywords ?? []) &&
        !tkt?.urgent &&
        tkt &&
        !['new', 'reviewed', 'actioned', 'failed'].includes(tkt.status)
      ) {
        await supabase.from('review_tickets').update({ urgent: true }).eq('id', ticketId)
        await audit(supabase, user_id, callSid, 'emergency_keyword_detected', 'kernel', {
          question_ord: qi,
          transcript: speechResult.slice(0, 500),
        })
      }
    }

    if (noAnswer) {
      if (attempt < 2) {
        // Repeat the same question once, with Paige excusing herself first.
        const repeat = `${stepBase}?stage=question&qi=${qi}&attempt=2&sorry=1&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
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

    // Answer captured: advance. Past the last question, stage=question
    // finalizes the call.
    const isLast = qi >= numQuestions
    const nextQi = isLast ? numQuestions + 1 : qi + 1
    const nextQ = `${stepBase}?stage=question&qi=${nextQi}&attempt=1&callSid=${encodeURIComponent(callSid)}&ticketId=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(userName)}`
    return twiml(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${xmlEscape(nextQ)}</Redirect>
</Response>`,
    )
  }

  // ----------------------------------------------------------- stage=voicemail
  // Record action callback for a voicemail: a missed live-connect (GREEN not
  // answered) or unreachable mode (zero questions). The message is stored as
  // answer ord 0 so the normal transcription pipeline picks it up, then the
  // ticket is finalized.
  if (stage === 'voicemail') {
    const recordingUrl = formGet(params, 'RecordingUrl')
    const recordingSid = formGet(params, 'RecordingSid')
    const durationStr = formGet(params, 'RecordingDuration')
    const duration = durationStr ? parseInt(durationStr, 10) : null
    const noMessage = !recordingSid || (duration !== null && duration < NO_ANSWER_DURATION_S)
    await supabase.from('review_ticket_answers').upsert(
      {
        ticket_id: ticketId,
        question_ord: 0,
        attempt: 1,
        question_text: 'Voicemail message',
        recording_sid: recordingSid || null,
        recording_url: recordingUrl || null,
        recording_duration: duration,
        transcript: null,
        transcription_status: noMessage ? 'none' : 'pending',
      },
      { onConflict: 'ticket_id,question_ord,attempt' },
    )
    return await finalize(supabase, callSid, ticketId, user_id, 'voicemail', 'voicemail', SCRIPT.thanksGoodbye)
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
  endedReason: 'completed' | 'no_answer' | 'caller_hung_up' | 'failed' | 'voicemail',
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

  // The ticket is reviewable now; the webhook fires once every recording has
  // a terminal transcript (immediately when there is nothing to transcribe).
  // Built-in notifications (email + push) fire from the same completion point.
  dispatchTicketWebhook(supabase, ticketId)
  dispatchTicketNotifications(ticketId)

  return twiml(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${speak(closingScript)}<Hangup/></Response>`,
  )
}
