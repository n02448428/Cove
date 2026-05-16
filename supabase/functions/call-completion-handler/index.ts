// supabase/functions/call-completion-handler/index.ts
// Cove MVP - Call completion webhook (Retell done + Twilio Dial/Record callbacks)
// Handles: forward, voicemail, block, failed outcomes + SMS/email notifications

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const APP_BASE_URL = Deno.env.get('APP_BASE_URL')!

serve(async (req: Request) => {
  try {
    const url = new URL(req.url)
    const contentType = req.headers.get('content-type') ?? ''
    let body: Record<string, string> = {}

    if (contentType.includes('application/json')) {
      body = await req.json()
    } else {
      const text = await req.text()
      const params = new URLSearchParams(text)
      params.forEach((v, k) => { body[k] = v })
    }

    // Support both query params (Retell webhook) and body params (Twilio callbacks)
    url.searchParams.forEach((v, k) => { body[k] = body[k] ?? v })

    const callSid = body['call_sid'] ?? body['CallSid'] ?? body['callSid'] ?? ''
    const outcome = body['outcome'] ?? body['action'] ?? ''
    const callerName = body['caller_name'] ?? body['CallerName'] ?? ''
    const summary = body['summary'] ?? ''
    const transcript = body['transcript'] ?? body['TranscriptionText'] ?? ''
    const voicemailUrl = body['RecordingUrl'] ?? body['voicemail_url'] ?? ''
    const userId = body['userId'] ?? body['user_id'] ?? ''
    const dialStatus = body['DialCallStatus'] ?? '' // Twilio Dial action callback
    const failureReason = body['failure_reason'] ?? ''

    if (!callSid) {
      return new Response('Missing callSid', { status: 400 })
    }

    // Idempotency: check if already in terminal state
    const { data: existing } = await supabase
      .from('call_logs')
      .select('status, user_id')
      .eq('call_sid', callSid)
      .single()

    const terminalStates = ['voicemail', 'blocked', 'failed']
    if (existing && terminalStates.includes(existing.status)) {
      console.log('Duplicate webhook - already terminal, skipping:', callSid)
      return new Response('OK', { status: 200 })
    }

    const resolvedUserId = userId || existing?.user_id || ''

    // Determine final outcome
    let finalOutcome = outcome

    // Handle Twilio Dial action callback (forwarded call result)
    if (dialStatus) {
      if (dialStatus === 'completed') {
        finalOutcome = 'forwarded'
      } else {
        // Dial failed or no-answer: fall to voicemail
        finalOutcome = 'voicemail'
      }
    }

    // Handle Retell webhook outcomes
    // Retell sends: action = 'forward' | 'voicemail' | 'block' | 'failed'
    if (outcome === 'forward') finalOutcome = 'forwarded'
    if (outcome === 'block') finalOutcome = 'blocked'

    // Execute outcome actions
    if (finalOutcome === 'forwarded' && resolvedUserId) {
      // Dial user's real number via Twilio
      const { data: phoneRow } = await supabase
        .from('phone_numbers')
        .select('real_number, notify_sms, notify_email')
        .eq('user_id', resolvedUserId)
        .single()

      if (phoneRow) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${body['From'] ?? ''}" action="${APP_BASE_URL}/functions/v1/call-completion-handler?outcome=voicemail&amp;callSid=${callSid}&amp;userId=${resolvedUserId}">
    <Number>${phoneRow.real_number}</Number>
  </Dial>
</Response>`

        // Update log as forwarded
        await updateCallLog(callSid, resolvedUserId, 'forwarded', callerName, summary, transcript, '', failureReason)
        await writeAudit(resolvedUserId, callSid, 'forwarded', 'twilio')
        return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })
      }
    }

    if (finalOutcome === 'voicemail' || finalOutcome === 'received') {
      // Save voicemail recording + transcript, then notify
      await updateCallLog(callSid, resolvedUserId, 'voicemail', callerName, summary, transcript, voicemailUrl, failureReason)
      await writeAudit(resolvedUserId, callSid, 'voicemail_saved', 'twilio')

      if (resolvedUserId) {
        await sendNotifications(resolvedUserId, callSid, callerName, summary, transcript)
      }

      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    if (finalOutcome === 'blocked') {
      await updateCallLog(callSid, resolvedUserId, 'blocked', callerName, summary, transcript, '', failureReason)
      await writeAudit(resolvedUserId, callSid, 'blocked', 'retell')
      return new Response('OK', { status: 200 })
    }

    if (finalOutcome === 'failed' || failureReason) {
      await updateCallLog(callSid, resolvedUserId, 'failed', callerName, summary, transcript, '', failureReason || 'unknown')
      await writeAudit(resolvedUserId, callSid, 'failed', 'system', { reason: failureReason })
      // Fallback: record voicemail
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Please leave a message after the beep.</Say>
  <Record maxLength="120" transcribe="true" />
</Response>`
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })
    }

    return new Response('OK', { status: 200 })

  } catch (err) {
    console.error('call-completion-handler error:', err)
    return new Response('Internal error', { status: 500 })
  }
})

async function updateCallLog(
  callSid: string,
  userId: string,
  status: string,
  callerName: string,
  summary: string,
  transcript: string,
  voicemailUrl: string,
  failureReason: string
) {
  await supabase.from('call_logs').upsert({
    call_sid: callSid,
    ...(userId ? { user_id: userId } : {}),
    status,
    outcome: status,
    caller_name: callerName || undefined,
    summary: summary || undefined,
    transcript: transcript || undefined,
    voicemail_url: voicemailUrl || undefined,
    failure_reason: failureReason || undefined,
  }, { onConflict: 'call_sid' })
}

async function writeAudit(
  userId: string,
  callSid: string,
  eventType: string,
  provider: string,
  payload?: Record<string, unknown>
) {
  if (!userId) return
  await supabase.from('call_audit').insert({
    user_id: userId,
    call_sid: callSid,
    event_type: eventType,
    provider,
    payload: payload ?? {},
  })
}

async function sendNotifications(
  userId: string,
  callSid: string,
  callerName: string,
  summary: string,
  transcript: string
) {
  const { data: prefs } = await supabase
    .from('phone_numbers')
    .select('real_number, notify_sms, notify_email')
    .eq('user_id', userId)
    .single()

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .single()

  if (!prefs) return

  const caller = callerName || 'Unknown caller'
  const msg = `Cove voicemail from ${caller}. Summary: ${summary || 'No summary available.'}`

  // SMS via Twilio (deduplicated by checking callSid)
  if (prefs.notify_sms && prefs.real_number) {
    try {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${Deno.env.get('TWILIO_ACCOUNT_SID')}/Messages.json`
      const auth = btoa(`${Deno.env.get('TWILIO_ACCOUNT_SID')}:${Deno.env.get('TWILIO_AUTH_TOKEN')}`)
      await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: prefs.real_number,
          From: Deno.env.get('TWILIO_PHONE_NUMBER') ?? '',
          Body: msg,
        }).toString()
      })
      await writeAudit(userId, callSid, 'sms_sent', 'twilio')
    } catch (e) {
      console.error('SMS send failed:', e)
      await writeAudit(userId, callSid, 'sms_failed', 'twilio', { error: String(e) })
    }
  }

  // Email via Resend
  if (prefs.notify_email && profile?.email) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Cove <noreply@coveai.app>',
          to: profile.email,
          subject: `Voicemail from ${caller}`,
          html: `<h2>New Voicemail</h2><p><strong>Caller:</strong> ${caller}</p><p><strong>Summary:</strong> ${summary || 'N/A'}</p><p><strong>Transcript:</strong> ${transcript || 'N/A'}</p>`,
        })
      })
      await writeAudit(userId, callSid, 'email_sent', 'resend')
    } catch (e) {
      console.error('Email send failed:', e)
      await writeAudit(userId, callSid, 'email_failed', 'resend', { error: String(e) })
    }
  }
}
