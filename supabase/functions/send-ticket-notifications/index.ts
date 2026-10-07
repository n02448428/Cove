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
import { sendWebPush } from '../_shared/_webpush.ts'
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

function fmtTime(iso: string, tz?: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      timeZone: tz || 'America/Los_Angeles',
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
      .select('id, user_id, call_sid, caller_number, urgent, classification, ended_reason, status, notifications_sent_at, created_at')
      .eq('id', ticketId)
      .maybeSingle()
    if (!ticket || ticket.notifications_sent_at) {
      return json(200, { ...result, skipped: 'already_sent' })
    }

    const { data: answers } = await supabase
      .from('review_ticket_answers')
      .select('question_ord, attempt, question_text, transcript, transcription_status')
      .eq('ticket_id', ticketId)
      .order('question_ord', { ascending: true })
      .order('attempt', { ascending: true })
    const rows = answers ?? []
    if (rows.some((a) => !TERMINAL_TRANSCRIPTION.includes(a.transcription_status))) {
      return json(200, { ...result, skipped: 'transcripts_pending' })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, email_mode, display_name, timezone, greeting')
      .eq('id', ticket.user_id)
      .maybeSingle()

    // Email routing by the user's chosen mode:
    //   off     — nothing, ever (claim so the digest skips it too)
    //   instant — email now (previous behavior)
    //   daily   — leave unclaimed; the hourly digest job picks it up
    //   urgent  — urgent tickets now, everything else waits for the digest
    const emailMode = profile?.email_mode ?? 'instant'
    const urgent = !!ticket.urgent
    if (emailMode === 'daily' || (emailMode === 'urgent' && !urgent)) {
      return json(200, { ...result, skipped: `deferred_to_digest (mode=${emailMode})` })
    }

    // Kernel v0.4: per-classification toggles. Check phone_numbers settings.
    // URGENT overrides all (if notify_email_urgent is on).
    const { data: phone } = await supabase
      .from('phone_numbers')
      .select('notify_email_lead, notify_email_customer, notify_email_solicitation, notify_email_urgent')
      .eq('user_id', ticket.user_id)
      .maybeSingle()
    if (phone) {
      const classification = (ticket.classification || 'LEAD').toUpperCase()
      // Urgent override: if urgent and urgent toggle is on, send regardless.
      if (urgent && phone.notify_email_urgent) {
        // proceed to send
      } else if (urgent && !phone.notify_email_urgent) {
        return json(200, { ...result, skipped: 'urgent_toggle_off' })
      } else if (classification === 'LEAD' && !phone.notify_email_lead) {
        return json(200, { ...result, skipped: 'lead_toggle_off' })
      } else if (classification === 'CUSTOMER' && !phone.notify_email_customer) {
        return json(200, { ...result, skipped: 'customer_toggle_off' })
      } else if (classification === 'SOLICITATION' && !phone.notify_email_solicitation) {
        return json(200, { ...result, skipped: 'solicitation_toggle_off' })
      }
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

    const caller = ticket.caller_number || 'Unknown caller'
    const when = fmtTime(ticket.created_at, profile?.timezone)
    const name = profile?.display_name || ''
    // Full conversation transcript: Cove's scripted lines + caller's answers.
    // Groups attempts per question so a misfire retry shows the apology.
    const greetingText = (profile?.greeting || '').replace(/\{name\}/g, name || 'there')
    const convo: { who: string; text: string }[] = []
    if (greetingText) convo.push({ who: 'Cove', text: greetingText })
    const byQ = new Map<number, typeof rows>()
    for (const a of rows) {
      const k = a.question_ord ?? 0
      if (!byQ.has(k)) byQ.set(k, [])
      byQ.get(k)!.push(a)
    }
    for (const [, attempts] of [...byQ.entries()].sort((x, y) => x[0] - y[0])) {
      for (let i = 0; i < attempts.length; i++) {
        const a = attempts[i]
        if (i > 0) convo.push({ who: 'Cove', text: "Sorry, I didn't quite catch that." })
        if (a.question_text) convo.push({ who: 'Cove', text: a.question_text })
        convo.push({ who: 'Caller', text: a.transcript || '(no answer recorded)' })
      }
    }
    convo.push({ who: 'Cove', text: 'Thank you. I will pass this along. Goodbye from Cove.' })
    const convoHtml = convo.map((c) =>
      `<p style="margin:0 0 14px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;"><strong class="${c.who === 'Cove' ? 'e-q' : 'e-caller'}" style="color:${c.who === 'Cove' ? '#f2f5f6' : '#5b9a9a'};">${c.who}:</strong> <span class="e-a" style="color:#9fb0ba;">${esc(c.text)}</span></p>`
    ).join('')

    // ---- Email ----
    let emailSent = false
    if (emailMode !== 'off' && profile?.email) {
      const subject = urgent ? `Urgent call from ${caller} — Cove` : `Call from ${caller} — Cove`
      const html = `<!DOCTYPE html><html><head><meta name="color-scheme" content="light dark"><style>
@media (prefers-color-scheme: light) {
  .e-bg { background-color: #eef1f4 !important; }
  .e-card { background-color: #ffffff !important; border-color: #dfe5ea !important; }
  .e-wordmark { color: #1a2332 !important; }
  .e-meta { color: #6b7a89 !important; }
  .e-headline { color: #1a2332 !important; }
  .e-caller { color: #3d7a7a !important; }
  .e-sub { color: #6b7a89 !important; }
  .e-q { color: #1a2332 !important; }
  .e-a { color: #4a5560 !important; }
  .e-btn { background-color: #487878 !important; color: #ffffff !important; }
  .e-foot { color: #8a9aa5 !important; }
  .e-signoff { color: #8a9aa5 !important; }
}
</style></head><body style="margin:0;padding:0;background:#0B1016;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="e-bg" style="background:#0B1016;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" class="e-card" style="max-width:560px;width:100%;background:#111820;border:1px solid #22303a;border-radius:16px;overflow:hidden;">
<tr><td style="padding:32px 32px 8px;text-align:center;">
<img src="https://www.withcove.co/cove-c.png" width="32" height="32" alt="C" style="display:inline-block;vertical-align:middle;margin-right:4px;"><span class="e-wordmark" style="font-family:Georgia,'Times New Roman',serif;font-size:30px;letter-spacing:0.1em;color:#ffffff;vertical-align:middle;">OVE</span>
<p class="e-meta" style="margin:10px 0 0;font-family:Georgia,serif;font-size:12px;letter-spacing:0.08em;color:#8a9aa5;">Cove &middot; ${esc(when)}${name ? ` &middot; for ${esc(name)}` : ''}</p>
</td></tr>
<tr><td style="padding:0 32px;"><div style="height:1px;background:#B88848;opacity:0.55;margin:16px 0 0;"></div></td></tr>
<tr><td style="padding:24px 32px 8px;">
<h1 class="e-headline" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:24px;color:#f2f5f6;">${urgent ? 'Urgent call' : 'New screened call'}</h1>
<p class="e-caller" style="margin:10px 0 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:20px;font-weight:600;color:#5b9a9a;">${esc(caller)}</p>
${ticket.ended_reason ? `<p class="e-sub" style="margin:6px 0 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:#8a9aa5;">${esc(ticket.ended_reason)}</p>` : ''}
</td></tr>
<tr><td style="padding:8px 32px 8px;">
${convo.length ? convoHtml : '<p class="e-a" style="font-family:-apple-system,\'Segoe UI\',Helvetica,Arial,sans-serif;font-size:14px;color:#9fb0ba;">They hung up before answering.</p>'}
</td></tr>
<tr><td style="padding:8px 32px 32px;text-align:center;">
<a href="https://withcove.co/dashboard" class="e-btn" style="display:inline-block;background:#5b9a9a;color:#0B1016;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:13px 34px;border-radius:999px;">Open in Cove</a>
<p class="e-foot" style="margin:18px 0 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#5f6f79;">Hear the recordings and manage this call in your dashboard.</p>
</td></tr>
</table>
<p class="e-signoff" style="margin:20px 0 0;font-family:Georgia,serif;font-size:12px;font-style:italic;color:#5f6f79;">Silence, except for the voices you love.</p>
</td></tr>
</table>
</body></html>`
      emailSent = await sendEmail(profile.email, subject, html)
    } else {
      console.log('send-ticket-notifications: email skipped (opted out or no address)')
    }
    result.email_sent = emailSent

    // ---- Web Push ----
    // Dormant: the dashboard no longer offers push (email is the notification
    // method). Only fires for pre-existing subscriptions on instant sends.
    let pushSent = 0
    const pushAllowed = emailMode === 'instant' || (emailMode === 'urgent' && urgent)
    if (pushAllowed && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
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
