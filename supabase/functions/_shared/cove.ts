// supabase/functions/_shared/cove.ts
// Cove Call Kernel v0.2 — shared helpers for all webhook edge functions.
// Source of truth: docs/Cove-Call-Kernel.md

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
export const SERVICE_ROLE_KEY =
  Deno.env.get('COVE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
export const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
export const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''

// Base URL for action callbacks into edge functions.
export function fnUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`
}

export function createSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or service role key')
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
}

// --- TwiML helpers -------------------------------------------------------

export function twiml(xml: string): Response {
  return new Response(xml, { headers: { 'Content-Type': 'text/xml; charset=UTF-8' } })
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// --- Form parsing --------------------------------------------------------

export async function parseForm(req: Request): Promise<URLSearchParams> {
  const text = await req.text()
  return new URLSearchParams(text)
}

export function formGet(p: URLSearchParams, ...keys: string[]): string {
  for (const k of keys) {
    const v = p.get(k)
    if (v !== null && v !== '') return v
  }
  return ''
}

// --- Twilio webhook signature validation ---------------------------------
// Reconstruct the public URL that Twilio signed for this webhook.
// Inside Supabase Edge Functions, req.url is the gateway-internal address
// (http scheme, /functions/v1 prefix stripped) — it NEVER matches the public
// https URL Twilio signs, so validating against req.url rejects every
// legitimate webhook. The public form is always:
//   https://<project>.supabase.co/functions/v1/<slug>[?query]
// The query string passes through the gateway untouched, so it is preserved.
export function twilioSignedUrl(req: Request, slug: string): string {
  let host = ''
  try {
    host = new URL(SUPABASE_URL).host
  } catch {
    host = ''
  }
  if (!host) host = new URL(req.url).host
  const search = new URL(req.url).search
  return `https://${host}/functions/v1/${slug}${search}`
}

// Fail closed: every Twilio webhook must carry a valid x-twilio-signature.
// Signature = base64(HMAC-SHA1(authToken, publicUrl + sorted POST params)).
// `slug` is this function's slug, used to rebuild the public URL (see above).
// IMPORTANT: TWILIO_AUTH_TOKEN in the function's secrets must exactly match
// the Auth Token shown in the Twilio console, or ALL inbound calls will be
// rejected with 403. Verify it before deploying this change.
export async function validateTwilioSignature(req: Request, body: string, slug: string): Promise<boolean> {
  const signature = req.headers.get('x-twilio-signature') ?? ''
  if (!TWILIO_AUTH_TOKEN) {
    console.error('validateTwilioSignature: TWILIO_AUTH_TOKEN not configured — rejecting request')
    return false
  }
  if (!signature) {
    console.warn('validateTwilioSignature: missing x-twilio-signature header — rejecting request')
    return false
  }
  try {
    const params = new URLSearchParams(body)
    const keys = Array.from(new Set(params.keys())).sort()
    let paramStr = ''
    for (const k of keys) {
      for (const v of params.getAll(k)) paramStr += k + v
    }
    // NOTE: never use req.url here — inside Supabase it is the internal
    // gateway address, not the public URL Twilio signed (see twilioSignedUrl).
    const baseUrl = twilioSignedUrl(req, slug)
    // The Supabase gateway normalizes query-string encoding (observed: %20
    // becomes +) while Twilio signs the URL exactly as it requested it.
    // Try the common encoding variants so a legitimately-signed request
    // validates regardless of which side normalized. Every variant still
    // requires the secret HMAC, so this does not weaken security.
    const candidates = [baseUrl]
    const qIdx = baseUrl.indexOf('?')
    if (qIdx !== -1) {
      const path = baseUrl.slice(0, qIdx)
      const query = baseUrl.slice(qIdx + 1)
      if (query.includes('+')) candidates.push(`${path}?${query.replace(/\+/g, '%20')}`)
      if (query.includes('%20')) candidates.push(`${path}?${query.replace(/%20/g, '+')}`)
    }
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(TWILIO_AUTH_TOKEN),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign'],
    )
    for (const candidate of candidates) {
      const data = candidate + paramStr
      const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
      const bytes = new Uint8Array(mac)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const expected = btoa(binary)
      if (timingSafeEqual(expected, signature)) return true
    }
    return false
  } catch (e) {
    console.error('validateTwilioSignature error:', e)
    return false
  }
}

// Constant-time string comparison (length check first).
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// --- DB helpers ----------------------------------------------------------

export async function logCall(
  supabase: SupabaseClient,
  callSid: string,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await supabase.from('call_logs').upsert(
    {
      call_sid: callSid,
      user_id: userId,
      ...patch,
    },
    { onConflict: 'call_sid' },
  )
}

export async function audit(
  supabase: SupabaseClient,
  userId: string,
  callSid: string,
  eventType: string,
  provider = 'twilio',
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (!userId) return
  await supabase.from('call_audit').insert({
    user_id: userId,
    call_sid: callSid,
    event_type: eventType,
    provider,
    payload,
  })
}

// Kernel scripts, spoken verbatim.
export const SCRIPT = {
  noAnswer: 'No answer. Goodbye.',
  thanksGoodbye: 'Thank you. I will pass this along. Goodbye from Cove.',
  notConfigured: 'This number is not configured yet.',
  voicemailMissed: "Sorry, they couldn't pick up. Please leave a message after the tone.",
  voicemailPrompt: 'Please leave a message after the tone.',
} as const

// Threshold (seconds) below which a recording is treated as "no answer" (caller
// silent). Twilio reports RecordingDuration as whole seconds; trim-silence makes
// a truly silent recording ~0s.
export const NO_ANSWER_DURATION_S = 1

// Emergency keywords: if a caller's transcript contains one of these, the
// ticket is flagged URGENT so the user can call back immediately. The live
// call is never redirected on a keyword match.
// Word-boundary matched, case-insensitive. Kept tight to limit false positives;
// "it's not an emergency" will still match — the user sees the transcript and
// decides in seconds. Includes Spanish (common in California).
// NOTE: scammers can learn these words. The tradeoff is deliberate: the filter
// never opens for self-declared urgency — a keyword match only flags the ticket
// URGENT so the user can call back. The live call is never redirected or
// connected on a caller's word alone.
const EMERGENCY_KEYWORDS = [
  'emergency',
  'urgent',
  'emergencia',
  'urgente',
  'ambulance',
  'ambulancia',
  'hospital',
  'police',
  'policía',
  'policia',
  'fire department',
  'bomberos',
  'accident',
  'accidente',
  'dying',
  'muriendo',
  'help me',
  'ayuda',
  'ayúdame',
  'ayudame',
  'call 911',
  'llama al 911',
  'nine one one',
]

const EMERGENCY_RE = new RegExp(
  `\\b(${EMERGENCY_KEYWORDS.map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('|')})\\b`,
  'i',
)

function customKeywordsRe(extra: string[]): RegExp | null {
  const words = (extra ?? []).map((w) => (w ?? '').trim().toLowerCase()).filter(Boolean).slice(0, 50)
  if (!words.length) return null
  return new RegExp(
    `\\b(${words.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'i',
  )
}

export function containsEmergencyKeyword(text: string | null | undefined, extraKeywords: string[] = []): boolean {
  if (!text) return false
  if (EMERGENCY_RE.test(text)) return true
  const re = customKeywordsRe(extraKeywords)
  return re ? re.test(text) : false
}

// ---- Outbound webhooks: ticket.completed postcards ----
// A user-configured URL receives the finished ticket as JSON, signed with
// HMAC-SHA256 (header X-Cove-Signature: sha256=<hex>). Zapier / Make turn
// one webhook into thousands of integrations (CRM, Slack, sheets...).
const TERMINAL_TRANSCRIPTION = ['completed', 'failed', 'none']

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Run a promise after the response without delaying the caller.
function background(p: Promise<void>): void {
  try {
    // @ts-ignore - Supabase Edge runtime global
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(p)
      return
    }
  } catch { /* fall through */ }
  p.catch((e) => console.error('background task failed:', e))
}

// Fire the ticket.completed webhook exactly once per ticket, only when every
// recording has a terminal transcript. Safe to call from finalize (call end)
// and from call-transcribe (each transcript); only the moment the ticket is
// fully done actually dispatches.
export function dispatchTicketWebhook(
  supabase: ReturnType<typeof createSupabase>,
  ticketId: string,
): void {
  background(_dispatchTicketWebhook(supabase, ticketId))
}

async function _dispatchTicketWebhook(
  supabase: ReturnType<typeof createSupabase>,
  ticketId: string,
): Promise<void> {
  try {
    const { data: ticket } = await supabase
      .from('review_tickets')
      .select('id, user_id, call_sid, caller_number, urgent, ended_reason, status, webhook_sent_at, created_at')
      .eq('id', ticketId)
      .maybeSingle()
    if (!ticket || ticket.status !== 'new' || ticket.webhook_sent_at) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('webhook_url, webhook_secret')
      .eq('id', ticket.user_id)
      .maybeSingle()
    const url = (profile?.webhook_url ?? '').trim()
    const lowerUrl = url.toLowerCase()
    if (!(lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://'))) return

    const { data: answers } = await supabase
      .from('review_ticket_answers')
      .select('question_ord, question_text, transcript, transcription_status, recording_url, recording_duration')
      .eq('ticket_id', ticketId)
      .order('question_ord', { ascending: true })
    const rows = answers ?? []
    if (rows.some((a) => !TERMINAL_TRANSCRIPTION.includes(a.transcription_status))) return

    // Atomic claim: exactly one dispatcher wins per ticket.
    const claimedAt = new Date().toISOString()
    const { data: claimed } = await supabase
      .from('review_tickets')
      .update({ webhook_sent_at: claimedAt })
      .eq('id', ticketId)
      .is('webhook_sent_at', null)
      .select('id')
    if (!claimed || claimed.length === 0) return

    const payload = {
      event: 'ticket.completed',
      ticket_id: ticket.id,
      call_sid: ticket.call_sid,
      caller_number: ticket.caller_number,
      urgent: !!ticket.urgent,
      ended_reason: ticket.ended_reason,
      created_at: ticket.created_at,
      transcripts_complete: true,
      messages: rows.map((a) => ({
        question: a.question_text,
        transcript: a.transcript,
        recording_url: a.recording_url,
        recording_duration_s: a.recording_duration,
      })),
    }
    const body = JSON.stringify(payload)
    const signature = 'sha256=' + (await hmacSha256Hex(profile?.webhook_secret ?? '', body))

    let ok = false
    let status = 0
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cove-Event': 'ticket.completed',
          'X-Cove-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(8000),
      })
      status = res.status
      ok = res.ok
    } catch (e) {
      console.error('webhook post failed:', e)
    }

    if (ok) {
      await audit(supabase, ticket.user_id, ticket.call_sid, 'webhook_dispatched', 'kernel', { status })
    } else {
      // Release the claim so a later ticket event can retry.
      await supabase
        .from('review_tickets')
        .update({ webhook_sent_at: null })
        .eq('id', ticketId)
        .eq('webhook_sent_at', claimedAt)
      await audit(supabase, ticket.user_id, ticket.call_sid, 'webhook_failed', 'kernel', { status })
    }
  } catch (e) {
    console.error('dispatchTicketWebhook error:', e)
  }
}

// ---- Full-call recording ----
// Starts a Twilio recording on the live inbound call (one API call) so the
// ticket carries the whole conversation, not just per-answer snippets.
// RecordingStatusCallback stores the RecordingSid on the ticket when done.
export function startFullCallRecording(callSid: string, ticketId: string): void {
  background(_startFullCallRecording(callSid, ticketId))
}

async function _startFullCallRecording(callSid: string, ticketId: string): Promise<void> {
  const note = async (event: string, payload: Record<string, unknown> = {}) => {
    try {
      const supabase = createSupabase()
      const { data: t } = await supabase.from('review_tickets').select('user_id').eq('id', ticketId).maybeSingle()
      if (t?.user_id) await audit(supabase, t.user_id, callSid, event, 'twilio', payload)
    } catch (e) {
      console.error('full recording audit failed:', e)
    }
  }
  try {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !SUPABASE_URL) {
      await note('full_recording_skipped', { reason: 'missing_config' })
      return
    }
    const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
    const cb = `${fnUrl('recording-status')}?ticketId=${encodeURIComponent(ticketId)}`
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls/${callSid}/Recordings.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${creds}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          RecordingStatusCallback: cb,
          RecordingStatusCallbackEvent: 'completed',
        }).toString(),
        signal: AbortSignal.timeout(8000),
      },
    )
    if (!res.ok) {
      await note('full_recording_start_failed', { status: res.status, body: (await res.text()).slice(0, 300) })
      return
    }
    const rec = await res.json().catch(() => ({}))
    await note('full_recording_started', { recording_sid: rec.sid ?? null })
  } catch (e) {
    console.error('startFullCallRecording error:', e)
    await note('full_recording_error', { error: String(e).slice(0, 300) })
  }
}

// ---- Built-in notifications: email + web push ----
// Same completion point as the ticket.completed webhook, but independent of
// it: notifications have their own exactly-once claim
// (review_tickets.notifications_sent_at, claimed inside the edge function),
// so they fire even when no webhook URL is configured. Safe to call from
// finalize (call end) and from call-transcribe (each transcript); only the
// moment the ticket is fully done actually sends.
export function dispatchTicketNotifications(ticketId: string): void {
  background(_dispatchTicketNotifications(ticketId))
}

async function _dispatchTicketNotifications(ticketId: string): Promise<void> {
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return
    await fetch(fnUrl('send-ticket-notifications'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ ticket_id: ticketId }),
      signal: AbortSignal.timeout(8000),
    })
  } catch (e) {
    console.error('dispatchTicketNotifications failed:', e)
  }
}
