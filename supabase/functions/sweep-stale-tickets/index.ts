// supabase/functions/sweep-stale-tickets/index.ts
// Cove — finalizes screened-call tickets stuck in collecting/transcribing.
// A caller who hangs up mid-screening never reaches the flow's finalize step,
// leaving the ticket unreviewable and the notification unsent. This sweeper
// moves such tickets to `new` (reviewable) and nudges the completion
// dispatchers; those still gate on terminal transcripts, so nothing fires
// early. Runs on a schedule (pg_cron).
//
// verify_jwt = false (called by pg_cron with the shared DIGEST_SECRET in the
// X-Cove-Cron-Secret header; it only ever touches the ticket owner's own
// tickets).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createSupabase, fnUrl, audit, dispatchTicketWebhook } from '../_shared/cove.ts'

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const DIGEST_SECRET = Deno.env.get('DIGEST_SECRET') ?? ''
// Calls older than this with no finalize are treated as hung up.
const STALE_AFTER_MINUTES = 20

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }
  const secret = req.headers.get('X-Cove-Cron-Secret') ?? ''
  if (!DIGEST_SECRET || secret !== DIGEST_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createSupabase()
  const cutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60 * 1000).toISOString()
  const { data: stale } = await supabase
    .from('review_tickets')
    .select('id, user_id, call_sid')
    .in('status', ['collecting', 'transcribing'])
    .lt('created_at', cutoff)
    .limit(50)

  let finalized = 0
  for (const t of stale ?? []) {
    const { data: updated } = await supabase
      .from('review_tickets')
      .update({ status: 'new', ended_reason: 'caller_hung_up' })
      .eq('id', t.id)
      .in('status', ['collecting', 'transcribing'])
      .select('id')
    if (!updated || updated.length === 0) continue
    finalized++
    await audit(supabase, t.user_id, t.call_sid, 'ticket_hung_up_swept', 'kernel', { ticket_id: t.id })
    // Both completion dispatchers gate on terminal transcripts internally.
    dispatchTicketWebhook(supabase, t.id)
    // Nudge the notification dispatcher; it gates on terminal transcripts.
    try {
      await fetch(fnUrl('send-ticket-notifications'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'apikey': SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ ticket_id: t.id }),
        signal: AbortSignal.timeout(8000),
      })
    } catch (e) {
      console.error('sweep notification dispatch failed:', e)
    }
  }

  return new Response(JSON.stringify({ ok: true, finalized }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
