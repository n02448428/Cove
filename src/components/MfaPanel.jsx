import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Two-factor authentication, opt-in. TOTP (authenticator app):
// enroll → scan QR → enter code → verified. One factor at a time.
export default function MfaPanel() {
  const [status, setStatus] = useState('loading'); // loading | off | on | enrolling
  const [factorId, setFactorId] = useState(null);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError('');
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setError(error.message);
      setStatus('off');
      return;
    }
    const verified = (data?.totp || []).find(f => f.status === 'verified');
    if (verified) {
      setFactorId(verified.id);
      setStatus('on');
    } else {
      setStatus('off');
    }
  }

  useEffect(() => { refresh(); }, []);

  async function startEnroll() {
    setBusy(true);
    setError('');
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStatus('enrolling');
    } catch (err) {
      setError(err.message || "Couldn't start setup. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnroll() {
    setBusy(true);
    setError('');
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr) throw chErr;
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() });
      if (error) throw error;
      setCode('');
      setQrCode('');
      setSecret('');
      await refresh();
    } catch (err) {
      setError(err.message || 'That code didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Turn off two-factor authentication?')) return;
    setBusy(true);
    setError('');
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setFactorId(null);
      await refresh();
    } catch (err) {
      setError(err.message || "Couldn't turn it off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 className="kernel-section-title" style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Two-factor authentication</h3>

      {status === 'loading' && (
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Checking…</p>
      )}

      {status === 'on' && (
        <>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.9rem' }}>
            On. You’ll enter a code from your authenticator app each time you sign in.
          </p>
          <button className="btn btn-ghost" onClick={remove} disabled={busy}>
            {busy ? 'Working…' : 'Turn off'}
          </button>
        </>
      )}

      {status === 'off' && (
        <>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.9rem' }}>
            Optional. Adds a code from your authenticator app at sign-in.
          </p>
          <button className="btn btn-primary" onClick={startEnroll} disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Working…' : 'Turn on'}
          </button>
        </>
      )}

      {status === 'enrolling' && (
        <>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
            Scan this with your authenticator app, then enter the code it shows.
          </p>
          {qrCode && (
            <div
              style={{ background: '#fff', padding: '0.75rem', borderRadius: '0.75rem', display: 'inline-block', marginBottom: '0.75rem' }}
              dangerouslySetInnerHTML={{ __html: qrCode }}
            />
          )}
          {secret && (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem', wordBreak: 'break-all' }}>
              Can’t scan? Enter this key manually: <strong style={{ color: 'var(--color-text)' }}>{secret}</strong>
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <input
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="6-digit code"
              inputMode="numeric"
              style={{ flex: 1 }}
              aria-label="Authenticator code"
            />
            <button className="btn btn-primary" onClick={verifyEnroll} disabled={busy || !code.trim()}>
              {busy ? 'Verifying…' : 'Verify'}
            </button>
          </div>
          <button className="btn btn-ghost" onClick={() => { setStatus('off'); setCode(''); }} style={{ marginTop: '0.5rem' }}>
            Cancel
          </button>
        </>
      )}

      {error && <p className="error-msg" style={{ marginTop: '0.6rem' }}>{error}</p>}
    </div>
  );
}
