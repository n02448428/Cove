import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { formatPhone } from '../lib/format.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const ENDED_REASON_LABELS = {
  completed: 'Completed',
  no_answer: 'No answer',
  caller_hung_up: 'Caller hung up',
  failed: 'Failed',
};

// RecordingPlayer — fetches Twilio recording through edge function proxy to avoid browser auth prompt
function RecordingPlayer({ recordingSid }) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!recordingSid) return;
    let revoked = false;
    setLoading(true);
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setError(true); setLoading(false); return; }
        const resp = await fetch(
          `${SUPABASE_URL}/functions/v1/recording-proxy?sid=${recordingSid}`,
          { headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY } },
        );
        if (!resp.ok) throw new Error('fetch failed');
        const blob = await resp.blob();
        if (!revoked) setUrl(URL.createObjectURL(blob));
      } catch { if (!revoked) setError(true); }
      finally { if (!revoked) setLoading(false); }
    })();
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [recordingSid]);

  if (loading) return <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.4rem' }}>Loading recording…</p>;
  if (error || !url) return null;
  return <audio controls src={url} style={{ marginTop: '0.4rem', width: '100%' }} />;
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

// CallCard — one call, calm surface, depth on tap.
// Dot color follows the kernel (green = trusted, gold = screening, red = blocked)
// with words beside it, never color alone. Actions are contextual:
// Call back always (when there's a number); Trust/Block only when the caller
// isn't already sorted.
export default function CallCard({
  ticket,
  isGreen,
  isRed,
  expanded,
  onToggle,
  answers,
  answersLoading,
  onMoveToList,
}) {
  const t = ticket;
  const dotClass = t.urgent ? 'dot--urgent' : isGreen ? 'dot--ok' : isRed ? 'dot--red' : 'dot--quiet';
  const caller = t.caller_name || formatPhone(t.caller_number) || 'Unknown caller';
  const sub = t.urgent
    ? 'Mentioned “urgent” — flagged for you'
    : isGreen
      ? 'Connected live'
      : t.summary || (t.ended_reason ? ENDED_REASON_LABELS[t.ended_reason] || t.ended_reason : 'No summary yet');

  return (
    <div className="call-card">
      <button type="button" className="call-card-summary" onClick={onToggle} aria-expanded={expanded}>
        <span className={`dot ${dotClass}`}></span>
        <span className="card-main">
          <span className="card-name">{caller}</span>
          <span className="card-sub">{sub}</span>
        </span>
        <span className="card-time">{fmtTime(t.created_at)}</span>
      </button>
      {expanded && (
        <div className="card-detail">
          {answersLoading ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Loading…</p>
          ) : answers?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '0.25rem' }}>
              {answers.map((a, i) => (
                <div key={i} style={{ fontSize: '0.85rem' }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                    {a.question_text}
                  </p>
                  {a.transcription_status && a.transcription_status !== 'completed' && (
                    <p style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Transcription: {a.transcription_status}</p>
                  )}
                  {a.transcript && (
                    <p style={{ color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>{a.transcript}</p>
                  )}
                  {a.recording_sid && <RecordingPlayer recordingSid={a.recording_sid} />}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No answers captured.</p>
          )}
          <div className="call-actions">
            {t.caller_number && (
              <a className="btn btn-primary call-action-btn" href={`tel:${t.caller_number}`}>Call back</a>
            )}
            {t.caller_number && !isGreen && (
              <button className="btn btn-ghost call-action-btn" onClick={() => onMoveToList(t, 'green')}>
                <span className="dot dot--green dot--sm" /> Trust
              </button>
            )}
            {t.caller_number && !isRed && (
              <button className="btn btn-ghost call-action-btn" onClick={() => onMoveToList(t, 'red')}>
                <span className="dot dot--red dot--sm" /> Block
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
