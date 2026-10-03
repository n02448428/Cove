import { useEffect, useMemo, useRef, useState } from 'react';
import CallCard from './CallCard.jsx';
import { formatPhone } from '../lib/format.js';
import { getReviewTicketAnswers } from '../services/api.js';

const LIVE_STATUSES = ['collecting', 'transcribing'];

function daypart() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function isToday(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  } catch {
    return false;
  }
}

// The Quiet Inbox — the dashboard answers one question: does anything need me?
// Only unseen (new) calls appear here. Opening a card marks it seen and it
// recedes into All calls. A live screening shows as a gently pulsing card
// with the answers arriving as they're transcribed.
export default function InboxView({
  displayName,
  tickets,
  callerLists,
  conciergeNumber,
  expandedTicket,
  onToggleTicket,
  ticketAnswers,
  ticketAnswersLoading,
  onMoveToList,
  onRefreshTickets,
  onOpenTickets,
  onCopyNumber,
  dailyLine,
}) {
  const [liveAnswers, setLiveAnswers] = useState([]);
  const [liveOpen, setLiveOpen] = useState(false);
  const pollRef = useRef(null);

  const newTickets = useMemo(() => tickets.filter(t => t.status === 'new'), [tickets]);
  const liveTicket = useMemo(
    () => tickets.filter(t => LIVE_STATUSES.includes(t.status)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null,
    [tickets]
  );
  const handledToday = useMemo(() => tickets.filter(t => isToday(t.created_at)).length, [tickets]);

  const greenNumbers = useMemo(() => new Set(callerLists.filter(c => c.classification === 'green').map(c => c.phone_number)), [callerLists]);
  const redNumbers = useMemo(() => new Set(callerLists.filter(c => c.classification === 'red').map(c => c.phone_number)), [callerLists]);

  // Poll for ticket changes (new arrivals, live progress) while the inbox is open.
  useEffect(() => {
    pollRef.current = setInterval(() => { onRefreshTickets(); }, 12000);
    return () => clearInterval(pollRef.current);
  }, [onRefreshTickets]);

  // While a call is live, refresh its answers so the transcript unfolds.
  useEffect(() => {
    if (!liveTicket) { setLiveAnswers([]); return; }
    let cancelled = false;
    async function load() {
      try {
        const answers = await getReviewTicketAnswers(liveTicket.id);
        if (!cancelled) setLiveAnswers(answers);
      } catch { /* quiet */ }
    }
    load();
    const id = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, [liveTicket?.id]);

  const newCount = newTickets.length;
  const name = displayName ? `, ${displayName}` : '';

  return (
    <div>
      <h1 className="inbox-greeting">{daypart()}{name}.</h1>
      {newCount > 0 ? (
        <p className="inbox-status">{newCount} call{newCount === 1 ? '' : 's'} need{newCount === 1 ? 's' : ''} your review.</p>
      ) : (
        <>
          <p className="inbox-status">All quiet — {handledToday} call{handledToday === 1 ? '' : 's'} handled today.</p>
          <p className="inbox-serenity">{dailyLine}</p>
        </>
      )}

      {liveTicket && (
        <div className="call-card live-card" style={{ marginTop: '1.1rem' }}>
          <button type="button" className="call-card-summary" onClick={() => setLiveOpen(v => !v)} aria-expanded={liveOpen}>
            <span className="dot dot--yellow live-pulse"></span>
            <span className="card-main">
              <span className="card-name">Screening a call…</span>
              <span className="card-sub">{liveTicket.caller_name || formatPhone(liveTicket.caller_number) || 'Unknown caller'}</span>
            </span>
          </button>
          {liveOpen && (
            <div className="card-detail">
              {liveAnswers.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {liveAnswers.map((a, i) => (
                    <div key={i} style={{ fontSize: '0.85rem' }}>
                      <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{a.question_text}</p>
                      {a.transcript ? (
                        <p style={{ color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>{a.transcript}</p>
                      ) : (
                        <p style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Listening…</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Cove is greeting the caller…</p>
              )}
            </div>
          )}
        </div>
      )}

      {newCount > 0 && (
        <div style={{ marginTop: liveTicket ? '1.4rem' : '1.1rem' }}>
          <p className="inbox-label">New</p>
          {newTickets.map(t => (
            <CallCard
              key={t.id}
              ticket={t}
              isGreen={greenNumbers.has(t.caller_number)}
              isRed={redNumbers.has(t.caller_number)}
              expanded={expandedTicket === t.id}
              onToggle={() => onToggleTicket(t)}
              answers={ticketAnswers[t.id]}
              answersLoading={ticketAnswersLoading[t.id]}
              onMoveToList={onMoveToList}
            />
          ))}
        </div>
      )}

      {conciergeNumber && (
        <div className="number-card">
          <div>
            <p className="number-label">Your Cove number</p>
            <p className="number-value">{formatPhone(conciergeNumber)}</p>
          </div>
          <button className="btn btn-ghost" style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }} onClick={onCopyNumber}>
            Copy
          </button>
        </div>
      )}

      <button type="button" className="all-calls-link" onClick={onOpenTickets}>
        All calls →
      </button>
    </div>
  );
}
