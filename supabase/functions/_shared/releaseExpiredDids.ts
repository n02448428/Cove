// Shared lazy DID release — no cron. Call from hot paths after grace ends.
// Soft-fails per number; never throws (callers must not break webhooks/voice).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''

const RELEASABLE_STATUSES = ['grace', 'canceled', 'none'] as const

export type ReleaseExpiredResult = {
  checked: number
  released: number
  failed: number
  skipped: number
}

/**
 * Release Twilio DIDs whose grace hold (reserved_until) has expired.
 * Only when profile.subscription_status is still grace|canceled|none
 * (do not release if user reactivated to trialing/active).
 */
export async function releaseExpiredDids(
  supabaseClient?: SupabaseClient,
): Promise<ReleaseExpiredResult> {
  const result: ReleaseExpiredResult = {
    checked: 0,
    released: 0,
    failed: 0,
    skipped: 0,
  }

  try {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      console.warn('releaseExpiredDids: Twilio secrets missing — skip')
      return result
    }

    const supabase =
      supabaseClient ??
      createClient(SUPABASE_URL, SERVICE_ROLE)

    const nowIso = new Date().toISOString()

    // Candidates: grace hold expired, still holding a Twilio number, not yet released
    // Cap batch so voice/webhook hot paths stay fast (lazy; remaining wait for next hit)
    const { data: rows, error } = await supabase
      .from('phone_numbers')
      .select('id, user_id, twilio_number, reserved_until, profiles!inner(subscription_status)')
      .lt('reserved_until', nowIso)
      .not('twilio_number', 'is', null)
      .is('released_at', null)
      .order('reserved_until', { ascending: true })
      .limit(5)

    if (error) {
      console.error('releaseExpiredDids: query failed', error)
      return result
    }

    if (!rows?.length) {
      return result
    }

    result.checked = rows.length
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

    for (const row of rows) {
      try {
        const profile = row.profiles as
          | { subscription_status: string | null }
          | { subscription_status: string | null }[]
          | null
        const status = Array.isArray(profile)
          ? profile[0]?.subscription_status
          : profile?.subscription_status

        if (!status || !RELEASABLE_STATUSES.includes(status as typeof RELEASABLE_STATUSES[number])) {
          result.skipped++
          continue
        }

        const phone = row.twilio_number as string
        const deleted = await twilioDeleteIncomingNumber(phone, auth)
        if (!deleted.ok) {
          console.error(
            'releaseExpiredDids: Twilio delete failed for',
            phone,
            deleted.detail,
          )
          result.failed++
          // Still mark released locally if number already gone from Twilio (404)
          if (!deleted.notFound) continue
        }

        const { error: updErr } = await supabase
          .from('phone_numbers')
          .update({
            released_at: new Date().toISOString(),
            twilio_number: null,
            provisioning_status: 'released',
            reserved_until: null,
          })
          .eq('id', row.id)

        if (updErr) {
          console.error('releaseExpiredDids: DB update failed', row.id, updErr)
          result.failed++
          continue
        }

        console.log('releaseExpiredDids: released', phone, 'user', row.user_id)
        result.released++
      } catch (e) {
        console.error('releaseExpiredDids: per-row error', row?.id, e)
        result.failed++
      }
    }
  } catch (e) {
    console.error('releaseExpiredDids: unexpected', e)
  }

  return result
}

async function twilioDeleteIncomingNumber(
  phoneNumber: string,
  auth: string,
): Promise<{ ok: boolean; notFound?: boolean; detail?: string }> {
  const listUrl =
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json` +
    `?PhoneNumber=${encodeURIComponent(phoneNumber)}`

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Basic ${auth}` },
  })
  if (!listRes.ok) {
    const t = await listRes.text()
    return { ok: false, detail: `list ${listRes.status}: ${t}` }
  }

  const listData = await listRes.json()
  const sid = listData?.incoming_phone_numbers?.[0]?.sid as string | undefined
  if (!sid) {
    // Already gone from Twilio — treat as notFound so caller can clear DB
    return { ok: false, notFound: true, detail: 'no IncomingPhoneNumber SID' }
  }

  const delUrl =
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${sid}.json`
  const delRes = await fetch(delUrl, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${auth}` },
  })

  if (delRes.status === 404) {
    return { ok: false, notFound: true, detail: '404' }
  }
  if (!delRes.ok) {
    const t = await delRes.text()
    return { ok: false, detail: `delete ${delRes.status}: ${t}` }
  }

  return { ok: true }
}
