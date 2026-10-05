// regenerate-voice: generate a voice clip for a line of text via ElevenLabs.
// POST { user_id, text }
// - Rate limited: 10/hour, 30/day per user (invisible guardrail).
// - Deduplicates by SHA256(text): identical text returns the existing file.
// - Uploads to the public `voice` storage bucket as {hash}.mp3.
// - screening-step constructs the same hash to build the playback URL.
//
// Requires ELEVENLABS_API_KEY in function secrets.
// Deploy with: sb-deploy-function regenerate-voice ... --verify-jwt false
// (called from the dashboard with the user's own auth; key stays server-side)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY') || ''
const VOICE_ID = 'NDTYOmYEjbDIVCKB35i3' // Paige — Cove's voice
const MODEL_ID = 'eleven_multilingual_v2'

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: CORS })
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'POST only' })
  if (!ELEVENLABS_API_KEY) return json(500, { error: 'voice service not configured' })

  let body: { user_id?: string; text?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'invalid JSON' })
  }
  const userId = (body.user_id || '').trim()
  const text = (body.text || '').trim()
  if (!userId || !text) return json(400, { error: 'user_id and text required' })
  if (text.length > 500) return json(400, { error: 'text too long (max 500 chars)' })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )

  // Rate limit: 10/hour, 30/day per user.
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const dayAgo = new Date(Date.now() - 86400_000).toISOString()
  const { count: hourCount } = await supabase
    .from('voice_generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', hourAgo)
  const { count: dayCount } = await supabase
    .from('voice_generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', dayAgo)
  if ((hourCount ?? 0) >= 10 || (dayCount ?? 0) >= 30) {
    return json(429, { error: 'rate_limited', retry_after: 300 })
  }

  const hash = await sha256Hex(text)
  const filename = `${hash}.mp3`

  // Dedupe: if this exact text was already generated, return it.
  const { data: existing } = await supabase.storage.from('voice').download(filename)
  if (existing) {
    return json(200, { filename, hash, cached: true })
  }

  // Generate via ElevenLabs.
  const ttsResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: MODEL_ID,
      voice_settings: { stability: 0.7, similarity_boost: 0.8 },
    }),
  })
  if (!ttsResp.ok) {
    const errText = await ttsResp.text().catch(() => '')
    console.error('elevenlabs error:', ttsResp.status, errText.slice(0, 200))
    return json(502, { error: 'voice_generation_failed', status: ttsResp.status })
  }
  const audio = new Uint8Array(await ttsResp.arrayBuffer())
  if (audio.length < 1000) return json(502, { error: 'voice_generation_failed' })

  // Upload to storage.
  const { error: upErr } = await supabase.storage.from('voice').upload(filename, audio, {
    contentType: 'audio/mpeg',
    upsert: true,
  })
  if (upErr) {
    console.error('storage upload error:', upErr.message)
    return json(500, { error: 'upload_failed' })
  }

  // Log for rate limiting.
  await supabase.from('voice_generations').insert({
    user_id: userId,
    text_hash: hash,
    characters: text.length,
  })

  return json(200, { filename, hash, cached: false, characters: text.length })
})
