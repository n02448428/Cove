// supabase/functions/retell-webhook/index.ts
// Retell AI -> Cove bridge. Retell owns the live conversation; Cove keeps
// the tickets, Quiet Inbox, and email notifications.
//
// Retell POSTs call events to this endpoint:
//   call_started  -> ignored (logged only)
//   call_ended    -> ignored for ticket data (fires BEFORE analysis exists)
//   call_analyzed -> the ticket is created here. This is the ONLY event with
//                    the transcript, summary, and custom_analysis_data.
//   (Never read transcript/outcome from call_ended.)
//
// Auth: two gates, either one passes.
//  1. HMAC-SHA256 — Retell signs every webhook with the account API key,
//     header `x-retell-signature`, computed over the RAW request body.
//     The key lives in the RETELL_API_KEY edge-function secret. Set it
//     whenever the key is available; it is the stronger gate.
//  2. URL token — the agent's webhook URL carries ?token=<random 128-bit>.
//     The token lives in the RETELL_WEBHOOK_TOKEN edge-function secret.
//     It is the working gate until RETELL_API_KEY is set: the token is
//     unguessable and known only to Retell (agent config) and this function.
// verify_jwt = false — Retell cannot pass a Supabase JWT; HMAC/token is the auth.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import {
  createSupabase,
  logCall,
  audit,
  dispatchTicketWebhook,
  dispatchTicketNotifications,
} from '../_shared/cove.ts'

const RETELL_API_KEY = Deno.env.get('RETELL_API_KEY') ?? ''
const RETELL_WEBHOOK_TOKEN = Deno.env.get('RETELL_WEBHOOK_TOKEN') ?? ''

function verifyToken(token: string | null): boolean {
  if (!token || !RETELL_WEBHOOK_TOKEN) return false
  if (token.length !== RETELL_WEBHOOK_TOKEN.length) return false
  return token === RETELL_WEBHOOK_TOKEN
}

async function hmacHex(key: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(body))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hmacBase64(key: string, body: string): Promise<string> {
  return hmacHex(key, body).then((hex) => {
    const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)))
    let bin = ''
    bytes.forEach((b) => (bin += String.fromCharCode(b)))
    return btoa(bin)
  })
}

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature || !RETELL_API_KEY) return false
  const want = signature.trim().toLowerCase()
  const hex = await hmacHex(RETELL_API_KEY, rawBody)
  if (hex === want) return true
  // Accept base64 too — Retell's documented format has varied; either is
  // a valid HMAC over the same body and key.
  const b64 = (await hmacBase64(RETELL_API_KEY, rawBody)).toLowerCase()
  return b64 === want
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-retell-signature')
  const url = new URL(req.url)
  const tokenOk = verifyToken(url.searchParams.get('token'))

  if (!(await verifySignature(rawBody, signature)) && !tokenOk) {
    console.error('retell-webhook: auth failed (no valid signature or token)')
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }

  const event = String(payload.event ?? '')
  const call = (payload.call ?? {}) as Record<string, unknown>

  // Only call_analyzed carries the transcript + analysis. Everything else
  // is acknowledged and ignored.
  if (event !== 'call_analyzed') {
    return new Response(JSON.stringify({ ok: true, ignored: event }))
  }

  try {
    const supabase = createSupabase()
    const callId = String(call.call_id ?? '')
    const fromNumber = String(call.from_number ?? '')
    const toNumber = String(call.to_number ?? '')
    const transcript = typeof call.transcript === 'string' ? call.transcript : ''
    const recordingUrl = typeof call.recording_url === 'string' ? call.recording_url : null
    const durationMs = typeof call.duration_ms === 'number' ? call.duration_ms : null
    const analysis = (call.call_analysis ?? {}) as Record<string, unknown>
    const summary = typeof analysis.call_summary === 'string' ? analysis.call_summary : ''
    const custom = (analysis.custom_analysis_data ?? {}) as Record<string, unknown>

    if (!callId || !toNumber) {
      console.error('retell-webhook: call_analyzed missing call_id or to_number')
      return new Response(JSON.stringify({ ok: false, error: 'missing call_id/to_number' }))
    }

    // Route the ticket to the Cove user who owns the number.
    // Inbound calls: to_number is the Cove number.
    // Outbound calls: from_number is the Cove number.
    const { data: phoneRows } = await supabase
      .from('phone_numbers')
      .select('user_id')
      .in('twilio_number', [toNumber, fromNumber])
      .limit(1)
    const phoneRow = phoneRows?.[0]

    if (!phoneRow) {
      console.error('retell-webhook: no Cove user for numbers', toNumber, fromNumber)
      return new Response(JSON.stringify({ ok: true, ignored: 'unknown_number' }))
    }
    const userId = phoneRow.user_id as string

    // Classification from the agent's structured analysis fields.
    // Agent prompt defines: is_solicitation (bool), is_existing_customer (bool).
    const isSolicitation = custom.is_solicitation === true
    const isCustomer = custom.is_existing_customer === true
    const classification = isSolicitation ? 'SOLICITATION' : isCustomer ? 'CUSTOMER' : 'LEAD'
    const callerName =
      typeof custom.caller_name === 'string' && custom.caller_name.trim()
        ? custom.caller_name.trim()
        : null

    // Idempotent on Retell's call_id: retries update, never duplicate.
    const { data: existing } = await supabase
      .from('review_tickets')
      .select('id')
      .eq('call_sid', callId)
      .maybeSingle()

    let ticketId: string
    if (existing) {
      ticketId = existing.id as string
      await supabase
        .from('review_tickets')
        .update({ status: 'new', ended_reason: 'completed', classification, summary: summary || null })
        .eq('id', ticketId)
    } else {
      const { data: ticket, error: ticketErr } = await supabase
        .from('review_tickets')
        .insert({
          user_id: userId,
          call_sid: callId,
          caller_number: fromNumber,
          caller_name: callerName,
          status: 'new',
          ended_reason: 'completed',
          classification,
          summary: summary || null,
        })
        .select('id')
        .single()
      if (ticketErr || !ticket) {
        console.error('retell-webhook: ticket insert failed', ticketErr)
        return new Response('Ticket insert failed', { status: 500 })
      }
      ticketId = ticket.id as string
    }

    // Store the full transcript + recording as the ticket's answer record,
    // so the Quiet Inbox shows the conversation like any screened call.
    await supabase.from('review_ticket_answers').upsert(
      {
        ticket_id: ticketId,
        question_ord: 0,
        attempt: 1,
        question_text: 'Retell call transcript',
        recording_sid: null,
        recording_url: recordingUrl,
        recording_duration: durationMs !== null ? Math.round(durationMs / 1000) : null,
        transcript: transcript || null,
        transcription_status: 'completed',
      },
      { onConflict: 'ticket_id,question_ord,attempt' },
    )

    await logCall(supabase, callId, userId, {
      ticket_id: ticketId,
      caller_number: fromNumber,
      outcome: 'retell_screened',
      status: 'retell_screened',
      call_state: 'retell_screened',
    })
    await audit(supabase, userId, callId, 'retell_call_analyzed', 'retell', {
      ticket_id: ticketId,
      classification,
      duration_ms: durationMs,
    })

    // Same completion path as a screened call: webhook + email notifications.
    dispatchTicketWebhook(supabase, ticketId)
    dispatchTicketNotifications(ticketId)

    return new Response(JSON.stringify({ ok: true, ticket_id: ticketId }))
  } catch (err) {
    console.error('retell-webhook error:', err)
    return new Response('Internal error', { status: 500 })
  }
})
