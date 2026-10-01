// supabase/functions/send-ticket-notifications/index.ts
// Cove — built-in ticket notifications (email via Resend + Web Push).
//
// POST { "ticket_id": "<uuid>" } — called internally when a ticket completes
// (same completion point as the ticket.completed webhook). Exactly-once via
// an atomic claim on review_tickets.notifications_sent_at.
//
// verify_jwt = false (service-role bearer in the Authorization header when
// called internally; the claim + terminal-transcript checks make replays
// harmless — it can only ever notify the ticket's own owner, once).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWebPush } from './_webpush.ts'
import { audit } from '../_shared/cove.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const NOTIFY_FROM_EMAIL = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'notifications@withcove.co'
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_CONTACT = Deno.env.get('VAPID_CONTACT') ?? 'mailto:notifications@withcove.co'

const TERMINAL_TRANSCRIPTION = ['completed', 'failed', 'none']

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log('send-ticket-notifications: RESEND_API_KEY unset, skipping email')
    return false
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: NOTIFY_FROM_EMAIL, to, subject, html }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      console.error('send-ticket-notifications: resend failed', res.status, await res.text())
      return false
    }
    return true
  } catch (e) {
    console.error('send-ticket-notifications: resend error', e)
    return false
  }
}

serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'POST only' })
  let ticketId = ''
  try {
    const body = await req.json()
    ticketId = String(body.ticket_id ?? '')
  } catch { /* fall through */ }
  if (!ticketId) return json(400, { ok: false, error: 'ticket_id required' })
  if (!SUPABASE_URL || !SERVICE_ROLE) return json(500, { ok: false, error: 'server misconfigured' })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const result: Record<string, unknown> = { ok: true, ticket_id: ticketId }

  try {
    const { data: ticket } = await supabase
      .from('review_tickets')
      .select('id, user_id, call_sid, caller_number, urgent, ended_reason, status, notifications_sent_at, created_at')
      .eq('id', ticketId)
      .maybeSingle()
    if (!ticket || ticket.status !== 'new' || ticket.notifications_sent_at) {
      return json(200, { ...result, skipped: 'already_sent_or_not_new' })
    }

    const { data: answers } = await supabase
      .from('review_ticket_answers')
      .select('question_ord, question_text, transcript, transcription_status')
      .eq('ticket_id', ticketId)
      .order('question_ord', { ascending: true })
    const rows = answers ?? []
    if (rows.some((a) => !TERMINAL_TRANSCRIPTION.includes(a.transcription_status))) {
      return json(200, { ...result, skipped: 'transcripts_pending' })
    }

    // Atomic claim: exactly one sender wins per ticket.
    const claimedAt = new Date().toISOString()
    const { data: claimed } = await supabase
      .from('review_tickets')
      .update({ notifications_sent_at: claimedAt })
      .eq('id', ticketId)
      .is('notifications_sent_at', null)
      .select('id')
    if (!claimed || claimed.length === 0) {
      return json(200, { ...result, skipped: 'claim_lost' })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, notify_email, display_name')
      .eq('id', ticket.user_id)
      .maybeSingle()

    const caller = ticket.caller_number || 'Unknown caller'
    const urgent = !!ticket.urgent
    const when = fmtTime(ticket.created_at)
    const name = profile?.display_name || ''
    const qa = rows.map((a) => ({
      q: a.question_text || '',
      a: a.transcript || '(no answer recorded)',
    }))

    // ---- Email ----
    let emailSent = false
    if (profile?.notify_email !== false && profile?.email) {
      const subject = urgent ? `Urgent call from ${caller} — Cove` : `Call from ${caller} — Cove`
      const qaHtml = qa.length
        ? qa.map((x) => `<p style="margin:0 0 12px"><strong>${esc(x.q)}</strong><br>${esc(x.a)}</p>`).join('')
        : '<p>They hung up before answering.</p>'
      const html = `<!DOCTYPE html><html><body style="font-family:Georgia,serif;color:#1c1c1c;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:13px;color:#888;margin:0 0 16px">Cove &middot; ${esc(when)}${name ? ` &middot; for ${esc(name)}` : ''}</p>
<h2 style="font-weight:600;margin:0 0 8px">${urgent ? '🚨 Urgent call' : 'New screened call'}</h2>
<p style="margin:0 0 16px"><strong>${esc(caller)}</strong>${ticket.ended_reason ? ` &mdash; ${esc(ticket.ended_reason)}` : ''}</p>
${qaHtml}
<p style="font-size:13px;color:#888;margin-top:24px">See the full ticket and recordings in your <a href="https://withcove.co/dashboard">Cove dashboard</a>.</p>
</body></html>`
      emailSent = await sendEmail(profile.email, subject, html)
    } else {
      console.log('send-ticket-notifications: email skipped (opted out or no address)')
    }
    result.email_sent = emailSent

    // ---- Web Push ----
    let pushSent = 0
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', ticket.user_id)
      const payload = JSON.stringify({
        title: urgent ? 'Cove — urgent call' : 'Cove — new call',
        body: `${caller}${qa[0]?.a ? ` — ${qa[0].a.slice(0, 90)}` : ''}`,
        url: '/dashboard',
      })
      for (const s of subs ?? []) {
        try {
          const r = await sendWebPush(
            { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
            payload,
            { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_CONTACT },
          )
          if (r === 'gone') {
            await supabase.from('push_subscriptions').delete().eq('id', s.id)
            console.log('send-ticket-notifications: pruned dead push subscription', s.id)
          } else {
            pushSent++
          }
        } catch (e) {
          console.error('send-ticket-notifications: push failed', e)
        }
      }
    } else {
      console.log('send-ticket-notifications: VAPID keys unset, skipping push')
    }
    result.push_sent = pushSent

    await audit(supabase, ticket.user_id, ticket.call_sid, 'notifications_sent', 'kernel', {
      email: emailSent,
      push: pushSent,
    })
    return json(200, result)
  } catch (e) {
    console.error('send-ticket-notifications error:', e)
    return json(500, { ok: false, error: 'internal' })
  }
})
