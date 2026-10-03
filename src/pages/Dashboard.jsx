import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { toE164, isValidE164, E164_ERROR } from '../lib/phone.js';
import AppHeader from '../components/AppHeader.jsx';
import AppFooter from '../components/AppFooter.jsx';
import CoveMark from '../components/CoveMark.jsx';
import InboxView from '../components/InboxView.jsx';
import CallCard from '../components/CallCard.jsx';
import {
  getCallerLists,
  addCallerList,
  getReviewTickets,
  getReviewTicketAnswers,
  updateReviewTicketStatus,
} from '../services/api.js';

const DAILY_LINES = [
  'Your pocket stays quiet. Your heart stays full.',
  'Remember when a ringing phone meant someone that mattered? It\u2019s like that again.',
  'Your life, uninterrupted \u2014 except by the people you\u2019d interrupt anything for.',
  'Breathe easier. Your phone\u2019s got the noise; you\u2019ve got the people.',
  'Calm isn\u2019t the absence of calls. It\u2019s the absence of the wrong ones.',
];

const TICKET_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'Needs review' },
  { id: 'urgent', label: 'Urgent' },
];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, now)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [userId, setUserId] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [callerLists, setCallerLists] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [conciergeNumber, setConciergeNumber] = useState('');
  const [provisioningStatus, setProvisioningStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // inbox | tickets (the digest deep-link ?tab=tickets opens the history)
  const [view, setView] = useState('inbox');
  const [ticketFilter, setTicketFilter] = useState('all');
  const [expandedTicket, setExpandedTicket] = useState(null);
  const [ticketAnswers, setTicketAnswers] = useState({});
  const [ticketAnswersLoading, setTicketAnswersLoading] = useState({});

  const dailyLine = DAILY_LINES[Math.floor(Date.now() / 86400000) % DAILY_LINES.length];

  const loadAll = useCallback(async (uid) => {
    const [lists, tix, phone, profile] = await Promise.all([
      getCallerLists(uid),
      getReviewTickets(uid),
      supabase.from('phone_numbers').select('twilio_number, provisioning_status').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('profiles').select('display_name').eq('id', uid).maybeSingle(),
    ]);
    setCallerLists(lists);
    setTickets(tix);
    setDisplayName(profile.data?.display_name || '');
    if (phone.data) {
      setConciergeNumber(phone.data.twilio_number || '');
      setProvisioningStatus(phone.data.provisioning_status || '');
    }
  }, []);

  const refreshTickets = useCallback(async () => {
    if (!userId) return;
    try {
      const tix = await getReviewTickets(userId);
      setTickets(tix);
    } catch {
      /* quiet — next poll retries */
    }
  }, [userId]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      try {
        await loadAll(user.id);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [loadAll]);

  useEffect(() => {
    if (searchParams.get('tab') === 'tickets') setView('tickets');
  }, [searchParams]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/');
  }

  function copyNumber() {
    if (conciergeNumber) navigator.clipboard.writeText(conciergeNumber);
  }

  // Opening a ticket marks it seen: it recedes from the inbox into history.
  async function toggleTicket(ticket) {
    if (expandedTicket === ticket.id) {
      setExpandedTicket(null);
      return;
    }
    setExpandedTicket(ticket.id);
    if (!ticketAnswers[ticket.id]) {
      setTicketAnswersLoading(s => ({ ...s, [ticket.id]: true }));
      try {
        const answers = await getReviewTicketAnswers(ticket.id);
        setTicketAnswers(prev => ({ ...prev, [ticket.id]: answers }));
      } catch (err) {
        setError(err.message);
      } finally {
        setTicketAnswersLoading(s => ({ ...s, [ticket.id]: false }));
      }
    }
    if (ticket.status === 'new') {
      try {
        const updated = await updateReviewTicketStatus(ticket.id, 'reviewed');
        setTickets(prev => prev.map(t => (t.id === ticket.id ? updated : t)));
      } catch {
        /* quiet — stays new, user can open again */
      }
    }
  }

  // Move caller from a review ticket to green or red list
  async function moveToList(ticket, classification) {
    if (!ticket.caller_number) return;
    const e164 = toE164(ticket.caller_number);
    if (!isValidE164(e164)) { setError(E164_ERROR); return; }
    const existing = callerLists.find(c => c.phone_number === e164 && c.classification === classification);
    if (existing) { setError(`Already on the ${classification === 'green' ? 'trusted' : 'blocked'} list.`); return; }
    try {
      const entry = await addCallerList(userId, {
        classification,
        phone_number: e164,
        contact_name: ticket.caller_name || null,
      });
      setCallerLists(prev => [...prev, entry]);
      if (ticket.status !== 'actioned') {
        const updated = await updateReviewTicketStatus(ticket.id, 'actioned');
        setTickets(prev => prev.map(t => (t.id === ticket.id ? updated : t)));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const greenNumbers = new Set(callerLists.filter(c => c.classification === 'green').map(c => c.phone_number));
  const redNumbers = new Set(callerLists.filter(c => c.classification === 'red').map(c => c.phone_number));

  const filteredTickets = ticketFilter === 'all'
    ? tickets
    : ticketFilter === 'new'
      ? tickets.filter(t => t.status === 'new')
      : tickets.filter(t => t.urgent);

  // Group history by day, newest first
  const grouped = [];
  for (const t of filteredTickets) {
    const label = dayLabel(t.created_at);
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.items.push(t);
    else grouped.push({ label, items: [t] });
  }

  if (loading) {
    return (
      <main className="page">
        <AppHeader homeTo="/dashboard" actions={<button className="btn btn-ghost" onClick={() => navigate('/settings')}>Settings</button>} />
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      </main>
    );
  }

  return (
    <main className="page">
      <AppHeader
        homeTo="/dashboard"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => navigate('/settings')}>Settings</button>
            <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
          </>
        }
      />

      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}

      {!conciergeNumber ? (
        <div className="concierge-card concierge-card--pending">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <CoveMark size={26} />
            <p className="concierge-card-label" style={{ margin: 0 }}>Your Cove Number</p>
          </div>
          <p className="concierge-card-number concierge-card-number--pending">
            {provisioningStatus === 'failed' ? 'Provisioning failed' : 'Provisioning…'}
          </p>
          <button className="btn btn-ghost" style={{ marginTop: '0.5rem' }} onClick={() => navigate('/forwarding')}>
            Check status →
          </button>
        </div>
      ) : view === 'inbox' ? (
        <InboxView
          displayName={displayName}
          tickets={tickets}
          callerLists={callerLists}
          conciergeNumber={conciergeNumber}
          expandedTicket={expandedTicket}
          onToggleTicket={toggleTicket}
          ticketAnswers={ticketAnswers}
          ticketAnswersLoading={ticketAnswersLoading}
          onMoveToList={moveToList}
          onRefreshTickets={refreshTickets}
          onOpenTickets={() => setView('tickets')}
          onCopyNumber={copyNumber}
          dailyLine={dailyLine}
        />
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setView('inbox')}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.9rem', padding: 0, marginBottom: '0.75rem', fontFamily: 'var(--font-sans)' }}
          >
            ‹ Dashboard
          </button>
          <h1 className="inbox-greeting" style={{ marginBottom: '1rem' }}>All calls.</h1>
          <div className="chips-row" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {TICKET_FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTicketFilter(f.id)}
                className={`chip${ticketFilter === f.id ? ' chip--active' : ''}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {grouped.length === 0 ? (
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Nothing here yet.</p>
          ) : (
            grouped.map(g => (
              <div key={g.label}>
                <p className="inbox-label">{g.label}</p>
                {g.items.map(t => (
                  <CallCard
                    key={t.id}
                    ticket={t}
                    isGreen={greenNumbers.has(t.caller_number)}
                    isRed={redNumbers.has(t.caller_number)}
                    expanded={expandedTicket === t.id}
                    onToggle={() => toggleTicket(t)}
                    answers={ticketAnswers[t.id]}
                    answersLoading={ticketAnswersLoading[t.id]}
                    onMoveToList={moveToList}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      )}
      <AppFooter />
    </main>
  );
}
