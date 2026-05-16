import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

const OUTCOME_LABELS = {
  forwarded: 'Forwarded',
  voicemail: 'Voicemail',
  blocked: 'Blocked',
  voicemail_fallback: 'Voicemail',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    async function fetchCalls() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('call_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      setCalls(data || []);
      setLoading(false);
    }
    fetchCalls();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/');
  }

  const filtered = filter === 'all' ? calls : calls.filter(c => c.outcome === filter);

  return (
    <main className="page">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Cove</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/settings')}>Settings</button>
          <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {['all', 'forwarded', 'voicemail', 'blocked'].map(f => (
          <button
            key={f}
            className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading calls...</p>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--color-text-muted)' }}>No calls yet. Make sure your number is forwarded to Cove.</p>
          <button className="btn btn-ghost" style={{ marginTop: '1rem' }} onClick={() => navigate('/forwarding')}>
            View forwarding instructions
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map(call => (
            <div
              key={call.id}
              className="card"
              style={{ cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === call.id ? null : call.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontWeight: 600 }}>{call.caller_name || call.from_number || 'Unknown'}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {new Date(call.created_at).toLocaleString()}
                  </p>
                </div>
                <span className={`badge badge-${call.outcome}`}>
                  {OUTCOME_LABELS[call.outcome] || call.outcome}
                </span>
              </div>

              {expanded === call.id && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                  {call.summary && <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>{call.summary}</p>}
                  {call.transcript && (
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Full transcript</summary>
                      <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap', color: 'var(--color-text-muted)' }}>{call.transcript}</p>
                    </details>
                  )}
                  {call.recording_url && (
                    <audio controls src={call.recording_url} style={{ marginTop: '0.75rem', width: '100%' }} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
