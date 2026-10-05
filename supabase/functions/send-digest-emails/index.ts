// supabase/functions/send-digest-emails/index.ts
// Cove — daily digest sender (cron ticks hourly; each user gets one
// digest per day at their chosen digest_time). Called by pg_cron (see migration
// 20261003000001 note / cron job 'cove-hourly-digest').
//
// For every user with email_mode 'daily' or 'urgent' whose local time has
// passed their digest_time and who hasn't received a digest today, collects
// all unclaimed 'new' tickets and sends ONE email listing them, with a link
// to manage them in the tickets dashboard. Exactly-once per ticket via the
// same atomic notifications_sent_at claim as send-ticket-notifications;
// exactly-once per day via profiles.last_digest_at.
//
// Auth: the cron caller passes the shared DIGEST_SECRET in the
// X-Cove-Cron-Secret header. verify_jwt = false.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { audit } from '../_shared/cove.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const NOTIFY_FROM_EMAIL = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'notifications@withcove.co'
const DIGEST_SECRET = Deno.env.get('DIGEST_SECRET') ?? ''
const DASHBOARD_URL = 'https://withcove.co/dashboard?tab=tickets'

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// Local YYYY-MM-DD and HH:MM for a timezone, from a Date.
function localParts(tz: string, d: Date): { date: string; hm: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hm: `${get('hour')}:${get('minute')}` }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log('send-digest-emails: RESEND_API_KEY unset, skipping')
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
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      console.error('send-digest-emails: resend failed', res.status, await res.text())
      return false
    }
    return true
  } catch (e) {
    console.error('send-digest-emails: resend error', e)
    return false
  }
}

serve(async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false })
  const secret = req.headers.get('X-Cove-Cron-Secret') ?? ''
  if (!DIGEST_SECRET || secret !== DIGEST_SECRET) {
    return json(401, { ok: false, error: 'unauthorized' })
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) return json(500, { ok: false, error: 'server misconfigured' })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const now = new Date()
  const result: Record<string, unknown> = { ok: true, digests_sent: 0, users_checked: 0 }

  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, email_mode, digest_time, timezone, last_digest_at, display_name')
      .in('email_mode', ['daily', 'urgent'])

    for (const p of profiles ?? []) {
      result.users_checked = (result.users_checked as number) + 1
      if (!p.email) continue
      const tz = p.timezone || 'America/Los_Angeles'
      const { date: today, hm: nowHm } = localParts(tz, now)
      const digestHm = (p.digest_time || '08:00').slice(0, 5)
      if (nowHm < digestHm) continue // not yet today
      if (p.last_digest_at) {
        const { date: lastDate } = localParts(tz, new Date(p.last_digest_at))
        if (lastDate >= today) continue // already sent today
      }

      // Collect this user's unclaimed new tickets.
      const { data: tickets } = await supabase
        .from('review_tickets')
        .select('id, caller_number, caller_name, urgent, ended_reason, created_at')
        .eq('user_id', p.id)
        .eq('status', 'new')
        .is('notifications_sent_at', null)
        .order('created_at', { ascending: true })
      if (!tickets || tickets.length === 0) continue

      // Atomic claim so a concurrent run can't double-send.
      const claimedAt = now.toISOString()
      const { data: claimed } = await supabase
        .from('review_tickets')
        .update({ notifications_sent_at: claimedAt })
        .eq('user_id', p.id)
        .eq('status', 'new')
        .is('notifications_sent_at', null)
        .select('id')
      if (!claimed || claimed.length === 0) continue

      const items = tickets.filter((t) => claimed.some((c) => c.id === t.id))
      if (!items.length) continue

      const cards = items.map((t) => {
        const caller = t.caller_name || t.caller_number || 'Unknown caller'
        return `<div class="e-digestcard" style="border:1px solid #22303a;border-radius:12px;padding:14px 16px;margin:0 0 12px;background:#111820;">
<p style="margin:0 0 4px;font-size:15px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;"><strong class="e-q" style="color:#f2f5f6;">${esc(caller)}</strong>${t.urgent ? ' <span style="background:#c0392b;color:#fff;font-size:11px;padding:2px 8px;border-radius:999px">Urgent</span>' : ''}</p>
<p class="e-sub" style="margin:0;font-size:13px;color:#8a9aa5;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${esc(fmtTime(t.created_at, tz))}${t.ended_reason ? ` &mdash; ${esc(t.ended_reason)}` : ''}</p>
</div>`
      }).join('')

      const n = items.length
      const subject = n === 1 ? '1 call — your Cove digest' : `${n} calls — your Cove digest`
      const html = `<!DOCTYPE html><html><head><meta name="color-scheme" content="light dark"><style>
@media (prefers-color-scheme: light) {
  .e-bg { background-color: #eef1f4 !important; }
  .e-card { background-color: #ffffff !important; border-color: #dfe5ea !important; }
  .e-wordmark { color: #1a2332 !important; }
  .e-meta { color: #6b7a89 !important; }
  .e-headline { color: #1a2332 !important; }
  .e-sub { color: #6b7a89 !important; }
  .e-q { color: #1a2332 !important; }
  .e-digestcard { background-color: #f7f9fa !important; border-color: #dfe5ea !important; }
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
<p class="e-meta" style="margin:10px 0 0;font-family:Georgia,serif;font-size:12px;letter-spacing:0.08em;color:#8a9aa5;">Cove &middot; digest for ${esc(today)}${p.display_name ? ` &middot; for ${esc(p.display_name)}` : ''}</p>
</td></tr>
<tr><td style="padding:0 32px;"><div style="height:1px;background:#B88848;opacity:0.55;margin:16px 0 0;"></div></td></tr>
<tr><td style="padding:24px 32px 8px;">
<h2 class="e-headline" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:24px;color:#f2f5f6;">${n === 1 ? '1 call since your last digest' : `${n} calls since your last digest`}</h2>
</td></tr>
<tr><td style="padding:8px 32px 8px;">${cards}</td></tr>
<tr><td style="padding:8px 32px 32px;text-align:center;">
<a href="${DASHBOARD_URL}" class="e-btn" style="display:inline-block;background:#5b9a9a;color:#0B1016;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:13px 34px;border-radius:999px;">Open in Cove</a>
<p class="e-foot" style="margin:18px 0 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#5f6f79;">You're getting the daily digest. Change this anytime in Settings.</p>
</td></tr>
</table>
<p class="e-signoff" style="margin:20px 0 0;font-family:Georgia,serif;font-size:12px;font-style:italic;color:#5f6f79;">Silence, except for the voices you love.</p>
</td></tr>
</table>
</body></html>`

      const sent = await sendEmail(p.email, subject, html)
      if (sent) {
        await supabase.from('profiles').update({ last_digest_at: now.toISOString() }).eq('id', p.id)
        result.digests_sent = (result.digests_sent as number) + 1
        await audit(supabase, p.id, null, 'digest_sent', 'kernel', { count: n })
      }
    }

    return json(200, result)
  } catch (e) {
    console.error('send-digest-emails error:', e)
    return json(500, { ok: false, error: 'internal' })
  }
})
