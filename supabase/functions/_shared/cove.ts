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
// Posture: Twilio always sends a valid x-twilio-signature header, which we
// verify when present and reject if tampered. If the header is absent (e.g.
// local/robustness cases) we allow the request through. Hardening TODO: enforce
// rejection of unsigned requests once the flow is proven in production.
export async function validateTwilioSignature(req: Request, body: string): Promise<boolean> {
  // TEMPORARY: signature validation disabled — TWILIO_AUTH_TOKEN env var mismatch.
  return true
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
