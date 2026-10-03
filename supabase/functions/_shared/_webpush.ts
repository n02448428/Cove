// supabase/functions/send-ticket-notifications/_webpush.ts
// Web Push delivery: RFC 8291 (aes128gcm content encoding) + RFC 8292 (VAPID).
// Pure WebCrypto — no dependencies.

export interface PushSubscription {
  endpoint: string
  p256dh: string // base64url, 65-byte uncompressed P-256 key
  auth: string // base64url, 16-byte auth secret
}

function b64urlEncode(data: Uint8Array): string {
  let s = ''
  for (let i = 0; i < data.length; i++) s += String.fromCharCode(data[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    len * 8,
  )
  return new Uint8Array(bits)
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

const te = new TextEncoder()

// Encrypt per RFC 8291 §3.4 (aes128gcm). Returns the full request body.
async function encryptAes128Gcm(sub: PushSubscription, plaintext: string): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(sub.p256dh)
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) throw new Error('bad p256dh key')
  const authSecret = b64urlDecode(sub.auth)
  if (authSecret.length !== 16) throw new Error('bad auth secret')

  const salt = crypto.getRandomValues(new Uint8Array(16))

  // Ephemeral ECDH keypair (app server side).
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const ephPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256))

  const keyInfo = concat(te.encode('WebPush: info'), new Uint8Array([0]), uaPublic, ephPublicRaw)
  const cekInfo = concat(te.encode('Content-Encoding: aes128gcm'), new Uint8Array([0]), keyInfo)
  const nonceInfo = concat(te.encode('Content-Encoding: nonce'), new Uint8Array([0]), keyInfo)
  const cek = await hkdf(shared, authSecret, cekInfo, 16)
  const nonce = await hkdf(shared, authSecret, nonceInfo, 12)

  // Plaintext: 2-byte BE pad length (0) || payload || 0x02 record delimiter.
  const msg = te.encode(plaintext)
  const padded = concat(new Uint8Array([0, 0]), msg, new Uint8Array([2]))

  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096)
  return concat(salt, rs, new Uint8Array([ephPublicRaw.length]), ephPublicRaw, ct)
}

// Build a VAPID JWT (RFC 8292) signed with our private key.
async function vapidToken(audience: string, subject: string, publicB64: string, privateB64: string): Promise<string> {
  const pubRaw = b64urlDecode(publicB64)
  const x = b64urlEncode(pubRaw.slice(1, 33))
  const y = b64urlEncode(pubRaw.slice(33, 65))
  const d = privateB64 // already base64url, 32 bytes
  const jwk = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const header = b64urlEncode(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(
    te.encode(JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: subject,
    })),
  )
  const unsigned = `${header}.${claims}`
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, jwk, te.encode(unsigned)),
  )
  // WebCrypto ECDSA returns raw R||S (64 bytes) — exactly what a JWT needs.
  // (Some runtimes return DER instead; handle that just in case.)
  const raw = sigBytes[0] === 0x30 ? derToRaw(sigBytes) : sigBytes
  return `${unsigned}.${b64urlEncode(raw)}`
}

// Convert a DER-encoded ECDSA signature to raw R||S (64 bytes).
function derToRaw(der: Uint8Array): Uint8Array {
  const rLen = der[3]
  const r = der.slice(4, 4 + rLen)
  const sOff = 4 + rLen + 2
  const sLen = der[sOff - 1]
  const s = der.slice(sOff, sOff + sLen)
  const raw = new Uint8Array(64)
  raw.set(r.slice(-32), 32 - Math.min(32, r.length))
  raw.set(s.slice(-32), 64 - Math.min(32, s.length))
  return raw
}

export interface VapidKeys {
  publicKey: string // base64url, 65 bytes
  privateKey: string // base64url, 32 bytes
  subject: string // mailto: contact
}

// Send one push. Returns 'ok', 'gone' (410/404 — prune it), or throws.
export async function sendWebPush(
  sub: PushSubscription,
  payload: string,
  vapid: VapidKeys,
): Promise<'ok' | 'gone'> {
  const url = new URL(sub.endpoint)
  const audience = `${url.protocol}//${url.host}`
  const body = await encryptAes128Gcm(sub, payload)
  const token = await vapidToken(audience, vapid.subject, vapid.publicKey, vapid.privateKey)

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
      'Authorization': `vapid t=${token}, k=${vapid.publicKey}`,
    },
    body,
    signal: AbortSignal.timeout(10000),
  })
  if (res.status === 404 || res.status === 410) return 'gone'
  if (!res.ok) throw new Error(`push failed: ${res.status}`)
  return 'ok'
}
