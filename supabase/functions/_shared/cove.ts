// supabase/functions/_shared/cove.ts
// Cove Call Kernel v0.1 — shared helpers for all webhook edge functions.
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
  thanks: 'Thank you.',
  thanksGoodbye: 'Thank you. I will pass this along. Have a great day. Goodbye.',
  notConfigured: 'This number is not configured yet.',
} as const

// Threshold (seconds) below which a recording is treated as "no answer" (caller
// silent). Twilio reports RecordingDuration as whole seconds; trim-silence makes
// a truly silent recording ~0s.
export const NO_ANSWER_DURATION_S = 1
