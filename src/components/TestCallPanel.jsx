import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// "Try it" — ring the user's real number through the live screening flow
// so they can hear what callers hear. Limited to 3 a day, server-side.
export default function TestCallPanel() {
  const [state, setState] = useState('idle'); // idle | calling | done
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function handleTestCall() {
    setState('calling');
    setMsg('');
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/request-test-call`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Call failed (${res.status})`);
      setState('done');
      setMsg(payload.message || 'Calling you now — pick up to hear what your callers hear.');
    } catch (err) {
      setState('idle');
      setError(err.message);
    }
  }

  return (
    <div>
      <h3 className="kernel-section-title" style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Try it</h3>
      <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', lineHeight: 1.55, marginBottom: '0.9rem' }}>
        We call your number from your Cove number — hear what callers hear. 3 a day.
      </p>
      <button
        className="btn btn-primary"
        onClick={handleTestCall}
        disabled={state === 'calling'}
        style={{ width: '100%' }}
      >
        {state === 'calling' ? 'Calling…' : state === 'done' ? 'Call again' : 'Call me now'}
      </button>
      {msg && <p style={{ fontSize: '0.9rem', color: 'var(--color-success)', marginTop: '0.6rem' }}>{msg}</p>}
      {error && <p className="error-msg" style={{ marginTop: '0.6rem' }}>{error}</p>}
    </div>
  );
}
