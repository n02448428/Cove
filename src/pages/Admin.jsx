import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function Admin() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      // Admin: fetch all call_logs across all users, ordered by most recent
      const { data, error } = await supabase
        .from('call_logs')
        .select('*, user_profiles(real_phone)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (!error) setLogs(data || []);
      setLoading(false);
    }
    fetchLogs();
  }, []);

  return (
    <main className="page">
      <h2 style={{ fontWeight: 800, fontSize: '1.5rem', marginBottom: '2rem' }}>Admin Console</h2>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)' }}>Loading...</p>
      ) : logs.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No call logs yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                {['Time', 'User phone', 'From', 'Outcome', 'Duration', 'Error'].map(h => (
                  <th key={h} style={{ padding: '0.5rem 1rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.7rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{log.user_profiles?.real_phone || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>{log.from_number || '—'}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className={`badge badge-${log.outcome}`}>{log.outcome}</span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>{log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                  <td style={{ padding: '0.75rem 1rem', color: 'var(--color-danger)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
