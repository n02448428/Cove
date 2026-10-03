// supabase/functions/send-digest-emails/index.ts
// Cove — hourly digest sender. Called by pg_cron (see migration
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
        return `<div style="border:1px solid #e5e0d8;border-radius:12px;padding:14px 16px;margin:0 0 12px">
<p style="margin:0 0 4px;font-size:15px"><strong>${esc(caller)}</strong>${t.urgent ? ' <span style="background:#c0392b;color:#fff;font-size:11px;padding:2px 8px;border-radius:999px">Urgent</span>' : ''}</p>
<p style="margin:0;font-size:13px;color:#888">${esc(fmtTime(t.created_at, tz))}${t.ended_reason ? ` &mdash; ${esc(t.ended_reason)}` : ''}</p>
</div>`
      }).join('')

      const n = items.length
      const subject = n === 1 ? '1 call — your Cove digest' : `${n} calls — your Cove digest`
      const html = `<!DOCTYPE html><html><body style="font-family:Georgia,serif;color:#1c1c1c;max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:13px;color:#888;margin:0 0 16px">Cove &middot; digest for ${esc(today)}${p.display_name ? ` &middot; for ${esc(p.display_name)}` : ''}</p>
<h2 style="font-weight:600;margin:0 0 16px">${n === 1 ? '1 call since your last digest' : `${n} calls since your last digest`}</h2>
${cards}
<p style="margin-top:24px"><a href="${DASHBOARD_URL}" target="_blank" style="display:inline-block;background:#1c1c1c;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px">Manage in your tickets dashboard</a></p>
<p style="font-size:12px;color:#aaa;margin-top:16px">You're getting the daily digest. Change this anytime in your Cove dashboard, under your call preview.</p>
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
