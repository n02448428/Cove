// supabase/functions/retell-inbound-gate/index.ts
// Retell Inbound Call Webhook — the RED-list gate for the live path.
//
// Retell POSTs here BEFORE the agent answers, whenever an inbound call
// arrives on a number with this URL set as its inbound webhook. The
// payload nests everything under `call_inbound`:
//   { event: "call_inbound",
//     call_inbound: { call_id, from_number, to_number, agent_id, ... } }
//
// This function checks the caller against the Cove user's RED list:
//   RED  -> { call_inbound: { reject: true } }  — Retell hangs up before
//           any agent or voice setup. No call object, no ticket.
//   else -> { call_inbound: {} }                — call proceeds normally.
//
// GREEN numbers are NOT special-cased here (they get normal Retell
// screening for now). The GREEN "greet by name, skip screening" behavior
// is a follow-up that will use this same webhook's dynamic_variables.
//
// Auth: ?token= URL token, checked against the RETELL_INBOUND_TOKEN
// edge-function secret (same pattern as retell-webhook's token gate).
// verify_jwt = false — Retell cannot pass a Supabase JWT.
//
// FAIL-OPEN BY DESIGN: any lookup error, unknown number, or unexpected
// payload lets the call through. A broken gate must never block real
// callers. Only an explicit RED match rejects. Retell retries a non-2xx
// up to 2 times (10s timeout each), so this function answers fast and
// never throws.

// deno-lint-ignore-file no-explicit-any

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createSupabase } from '../_shared/cove.ts'

const INBOUND_TOKEN = Deno.env.get('RETELL_INBOUND_TOKEN') ?? ''

function verifyToken(token: string | null): boolean {
  if (!token || !INBOUND_TOKEN) return false
  if (token.length !== INBOUND_TOKEN.length) return false
  return token === INBOUND_TOKEN
}

// Last 10 digits, for a robust match if formatting ever differs.
function digits10(n: string): string {
  const d = n.replace(/\D/g, '')
  return d.length > 10 ? d.slice(-10) : d
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url = new URL(req.url)
  if (!verifyToken(url.searchParams.get('token'))) {
    console.error('retell-inbound-gate: auth failed (bad or missing token)')
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: Record<string, any>
  try {
    payload = (await req.json()) as Record<string, any>
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }

  // SMS hits the same webhook shape under chat_inbound; we do not gate SMS.
  if (payload.chat_inbound) {
    return new Response(JSON.stringify({ chat_inbound: {} }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Caller info is nested under call_inbound, not top-level. Read both
  // defensively in case Retell ever changes the shape.
  const inbound = (payload.call_inbound ?? {}) as Record<string, any>
  const fromNumber = String(inbound.from_number ?? payload.from_number ?? '')
  const toNumber = String(inbound.to_number ?? payload.to_number ?? '')

  const allow = () =>
    new Response(JSON.stringify({ call_inbound: {} }), {
      headers: { 'Content-Type': 'application/json' },
    })
  const reject = () =>
    new Response(JSON.stringify({ call_inbound: { reject: true } }), {
      headers: { 'Content-Type': 'application/json' },
    })

  if (!fromNumber || !toNumber) {
    console.error('retell-inbound-gate: missing from/to number', JSON.stringify(payload).slice(0, 300))
    return allow()
  }

  try {
    const supabase = createSupabase()

    // Route to the Cove user who owns the called number.
    const { data: phoneRows } = await supabase
      .from('phone_numbers')
      .select('user_id')
      .eq('twilio_number', toNumber)
      .limit(1)
    const userId = phoneRows?.[0]?.user_id as string | undefined
    if (!userId) {
      console.error('retell-inbound-gate: no Cove user for', toNumber)
      return allow()
    }

    // RED check: exact E.164 match first, then last-10-digits fallback.
    const { data: redRows } = await supabase
      .from('caller_lists')
      .select('phone_number')
      .eq('user_id', userId)
      .eq('classification', 'red')
    const redNumbers = (redRows ?? []).map((r: any) => String(r.phone_number))
    const from10 = digits10(fromNumber)
    const isRed =
      redNumbers.includes(fromNumber) ||
      redNumbers.some((n: string) => digits10(n) === from10 && from10.length === 10)

    if (isRed) {
      console.log('retell-inbound-gate: RED reject', fromNumber, '->', toNumber)
      return reject()
    }

    return allow()
  } catch (err) {
    // Fail open: never block a real caller because of a lookup error.
    console.error('retell-inbound-gate error (fail-open):', err)
    return allow()
  }
})
