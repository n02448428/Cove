import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { toE164, isValidE164, E164_ERROR } from '../lib/phone.js';
import { formatPhone } from '../lib/format.js';
import AppHeader from '../components/AppHeader.jsx';
import AppFooter from '../components/AppFooter.jsx';
import CoveMark from '../components/CoveMark.jsx';
import NotificationsPanel from '../components/NotificationsPanel.jsx';
import {
  getCallerLists,
  addCallerList,
  deleteCallerList,
  getScreeningQuestions,
  replaceScreeningQuestions,
  getReviewTickets,
  getReviewTicketAnswers,
  updateReviewTicketStatus,
  getCallLogs,
} from '../services/api.js';

const OUTCOME_LABELS = {
  received: 'Received',
  screening: 'Screening',
  rejected: 'Rejected',
  connected_live: 'Connected',
  screened: 'Screened',
  code_connected: 'Code',
  emergency_connected: 'Emergency',
  no_answer: 'No answer',
  failed: 'Failed',
};

const TICKET_STATUS_LABELS = {
  collecting: 'Collecting',
  transcribing: 'Transcribing',
  new: 'New',
  reviewed: 'Reviewed',
  actioned: 'Actioned',
  failed: 'Failed',
};

const ENDED_REASON_LABELS = {
  completed: 'Completed',
  no_answer: 'No answer',
  caller_hung_up: 'Caller hung up',
  failed: 'Failed',
};

const CALL_OUTCOMES = ['all', 'received', 'screening', 'rejected', 'connected_live', 'screened', 'code_connected', 'no_answer', 'failed'];
const TICKET_FILTERS = ['all', 'new', 'reviewed', 'actioned'];

const MAX_QUESTIONS = 5;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

function Chevron({ open }) {
  return (
    <svg
      className={`section-chevron${open ? ' section-chevron--open' : ''}`}
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);

  // rotating daily line — one of the Cove voice lines, changes each day
  const DAILY_LINES = [
    'Your pocket stays quiet. Your heart stays full.',
    'Remember when a ringing phone meant someone that mattered? It\u2019s like that again.',
    'Your life, uninterrupted \u2014 except by the people you\u2019d interrupt anything for.',
    'Breathe easier. Your phone\u2019s got the noise; you\u2019ve got the people.',
    'Calm isn\u2019t the absence of calls. It\u2019s the absence of the wrong ones.',
  ];
  const dailyLine = DAILY_LINES[Math.floor(Date.now() / 86400000) % DAILY_LINES.length];

  // kernel data
  const [callerLists, setCallerLists] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [calls, setCalls] = useState([]);

  // concierge number
  const [conciergeNumber, setConciergeNumber] = useState('');
  const [provisioningStatus, setProvisioningStatus] = useState('');

  // collapsible sections
  const [openSections, setOpenSections] = useState({ green: true, yellow: true, red: false, webhooks: false });
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookMsg, setWebhookMsg] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // call log
  const [expandedCall, setExpandedCall] = useState(null);
  const [callFilter, setCallFilter] = useState('all');

  // dashboard tabs: 'overview' | 'tickets'
  const [dashTab, setDashTab] = useState('overview');

  // tickets
  const [ticketFilter, setTicketFilter] = useState('all');
  const [expandedTicket, setExpandedTicket] = useState(null);
  const [ticketAnswers, setTicketAnswers] = useState({});
  const [ticketAnswersLoading, setTicketAnswersLoading] = useState({});

  // RED form
  const [redPhone, setRedPhone] = useState('');
  const [redName, setRedName] = useState('');

  // GREEN form
  const [greenPhone, setGreenPhone] = useState('');
  const [greenName, setGreenName] = useState('');


  // question editing
  const [questionDrafts, setQuestionDrafts] = useState({});
  const [newQuestion, setNewQuestion] = useState('');

  // greeting editing
  const [greeting, setGreeting] = useState('');
  const [greetingDraft, setGreetingDraft] = useState(null);

  // display name editing (what {name} resolves to)
  const [displayName, setDisplayName] = useState('');
  const [displayNameDraft, setDisplayNameDraft] = useState(null);

  // test call ("Call me now")
  const [testCallState, setTestCallState] = useState('idle'); // idle | calling | done
  const [testCallMsg, setTestCallMsg] = useState('');

  // Live conversation preview: greeting (draft if editing) with {name} resolved,
  // falling back to the kernel default greeting when none is saved.
  const DEFAULT_GREETING = "Hello, this is Cove, {name}'s assistant. This call may be recorded.";
  const previewName = displayNameDraft !== null ? displayNameDraft : (displayName || '{name}');
  const previewGreeting = ((greetingDraft ?? greeting) || DEFAULT_GREETING).replace(/\{name\}/g, previewName);
  const KERNEL_CLOSE = 'Thank you. I will pass this along. Goodbye.';

  const loadAll = useCallback(async (uid) => {
    const [lists, qs, tix, logs, phone, profile] = await Promise.all([
      getCallerLists(uid),
      getScreeningQuestions(uid),
      getReviewTickets(uid),
      getCallLogs(uid, { limit: 100 }),
      supabase.from('phone_numbers').select('twilio_number, provisioning_status').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('profiles').select('greeting, display_name, webhook_url, webhook_secret').eq('id', uid).maybeSingle(),
    ]);
    setCallerLists(lists);
    setQuestions(qs);
    setTickets(tix);
    setCalls(logs);
    setGreeting(profile.data?.greeting || '');
    setDisplayName(profile.data?.display_name || '');
    setWebhookUrl(profile.data?.webhook_url || '');
    setWebhookSecret(profile.data?.webhook_secret || '');
    if (phone.data) {
      setConciergeNumber(phone.data.twilio_number || '');
      setProvisioningStatus(phone.data.provisioning_status || '');
    }
  }, []);

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

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/');
  }

  function toggleSection(name) {
    setOpenSections(prev => ({ ...prev, [name]: !prev[name] }));
  }

  async function hmacHex(secret, body) {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret || ''),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function newSecret() {
    return [...crypto.getRandomValues(new Uint8Array(24))]
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function saveWebhook() {
    setError('');
    setWebhookMsg('');
    try {
      let secret = webhookSecret;
      if (webhookUrl.trim() && !secret) {
        secret = newSecret();
        setWebhookSecret(secret);
      }
      const { error } = await supabase.from('profiles').update({
        webhook_url: webhookUrl.trim() || null,
        webhook_secret: secret || null,
      }).eq('id', userId);
      if (error) throw error;
      setWebhookMsg('Saved.');
    } catch (err) {
      setError(err.message);
    }
  }

  function regenerateWebhookSecret() {
    setWebhookSecret(newSecret());
    setWebhookMsg('New secret generated — press Save.');
  }

  async function testWebhook() {
    setError('');
    setWebhookMsg('Sending…');
    try {
      const body = JSON.stringify({
        event: 'webhook.test',
        ticket_id: 'test',
        caller_number: '+16195550100',
        urgent: false,
        ended_reason: 'completed',
        created_at: new Date().toISOString(),
        transcripts_complete: true,
        messages: [
          { question: 'Test question', transcript: 'This is a test postcard from Cove.', recording_url: null },
        ],
      });
      const res = await fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cove-Event': 'webhook.test',
          'X-Cove-Signature': 'sha256=' + (await hmacHex(webhookSecret, body)),
        },
        body,
      });
      setWebhookMsg(res.ok
        ? `Test delivered (${res.status}). Check the receiving app.`
        : `Receiver replied ${res.status} — check the URL.`);
    } catch (err) {
      setWebhookMsg('Could not reach the URL.');
    }
  }

  function copyNumber() {
    if (conciergeNumber) navigator.clipboard.writeText(conciergeNumber);
  }

  // — Test call: ring the user's real number through the live screening flow —
  async function handleTestCall() {
    setTestCallState('calling');
    setTestCallMsg('');
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/request-test-call`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Call failed (${res.status})`);
      setTestCallState('done');
      setTestCallMsg(payload.message || 'Calling you now — pick up to hear what your callers hear.');
    } catch (err) {
      setTestCallState('idle');
      setError(err.message);
    }
  }

  // — RED / GREEN lists ————————————————————————————
  const redList = callerLists.filter(c => c.classification === 'red');
  const greenList = callerLists.filter(c => c.classification === 'green');

  async function handleAddCallerList(classification) {
    setError('');
    const phone = classification === 'red' ? redPhone : greenPhone;
    const name = classification === 'red' ? redName : greenName;
    const normalized = toE164(phone);
    if (!isValidE164(normalized)) {
      setError(E164_ERROR);
      return;
    }
    try {
      const added = await addCallerList(userId, { phone_number: normalized, classification, contact_name: name });
      setCallerLists(prev => [...prev, added].sort((a, b) =>
        a.classification.localeCompare(b.classification) || a.created_at.localeCompare(b.created_at)
      ));
      if (classification === 'red') { setRedPhone(''); setRedName(''); }
      else { setGreenPhone(''); setGreenName(''); }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteCallerList(id) {
    setError('');
    try {
      await deleteCallerList(id);
      setCallerLists(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  // — Display name ({name} substitution) ————————————————————
  async function saveDisplayName() {
    setError('');
    const text = (displayNameDraft ?? '').trim();
    if (!text) {
      setError('Display name cannot be empty.');
      return;
    }
    try {
      const { error } = await supabase.from('profiles').update({ display_name: text }).eq('id', userId);
      if (error) throw error;
      setDisplayName(text);
      setDisplayNameDraft(null);
    } catch (err) {
      setError(err.message);
    }
  }

  // — Greeting ————————————————————————————————————
  async function saveGreeting() {
    setError('');
    const text = (greetingDraft ?? '').trim();
    if (!text) {
      setError('Greeting cannot be empty.');
      return;
    }
    try {
      const { error } = await supabase.from('profiles').update({ greeting: text }).eq('id', userId);
      if (error) throw error;
      setGreeting(text);
      setGreetingDraft(null);
    } catch (err) {
      setError(err.message);
    }
  }

  // — Questions ———————————————————————————————————
  function startEditQuestion(q) {
    setQuestionDrafts(d => ({ ...d, [q.id]: q.question }));
  }

  async function saveQuestion(q) {
    setError('');
    const text = (questionDrafts[q.id] ?? '').trim();
    if (!text) return;
    try {
      const texts = questions.map(x => (x.id === q.id ? text : x.question));
      const fresh = await replaceScreeningQuestions(userId, texts);
      setQuestions(fresh);
      setQuestionDrafts(d => { const n = { ...d }; delete n[q.id]; return n; });
    } catch (err) {
      setError(err.message);
    }
  }

  async function addQuestion() {
    setError('');
    const text = newQuestion.trim();
    if (!text) return;
    if (questions.length >= MAX_QUESTIONS) {
      setError(`Maximum ${MAX_QUESTIONS} questions reached.`);
      return;
    }
    try {
      const texts = [...questions.map(q => q.question), text];
      const fresh = await replaceScreeningQuestions(userId, texts);
      setQuestions(fresh);
      setNewQuestion('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteQuestion(q) {
    setError('');
    // Keep at least one question so live Yellow screening always has something to ask.
    if (questions.length <= 1) {
      setError('Keep at least one screening question. Edit it instead of deleting.');
      return;
    }
    try {
      const texts = questions.filter(x => x.id !== q.id).map(x => x.question);
      const fresh = await replaceScreeningQuestions(userId, texts);
      setQuestions(fresh);
    } catch (err) {
      setError(err.message);
    }
  }

  // — Review tickets ———————————————————————————————
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
  }

  async function setTicketStatus(ticket, status) {
    setError('');
    try {
      const updated = await updateReviewTicketStatus(ticket.id, status);
      setTickets(prev => prev.map(t => (t.id === ticket.id ? updated : t)));
    } catch (err) {
      setError(err.message);
    }
  }

  // Move caller from a review ticket to green or red list
  async function moveToList(ticket, classification) {
    if (!ticket.caller_number) return;
    const e164 = toE164(ticket.caller_number);
    if (!isValidE164(e164)) { setError(E164_ERROR); return; }
    // Check if already on that list
    const existing = callerLists.find(c => c.caller_number === e164 && c.classification === classification);
    if (existing) { setError('Already on ' + classification.toUpperCase() + ' list.'); return; }
    try {
      const entry = await addCallerList(userId, {
        classification,
        caller_number: e164,
        caller_name: ticket.caller_name || null,
      });
      setCallerLists(prev => [...prev, entry]);
      // Auto-mark ticket as actioned
      if (ticket.status !== 'actioned') {
        const updated = await updateReviewTicketStatus(ticket.id, 'actioned');
        setTickets(prev => prev.map(t => (t.id === ticket.id ? updated : t)));
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const filteredTickets = (ticketFilter === 'all' ? tickets : tickets.filter(t => t.status === ticketFilter))
    .slice()
    .sort((a, b) => Number(b.urgent || false) - Number(a.urgent || false));

  // — Call log ————————————————————————————————————
  const filteredCalls = callFilter === 'all' ? calls : calls.filter(c => c.outcome === callFilter);

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
      <div className="page-wash" aria-hidden="true">
        <img className="page-wash__img" src="/cove-hero.webp" alt="" />
      </div>
      <AppHeader
        homeTo="/dashboard"
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => navigate('/settings')}>Settings</button>
            <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
          </>
        }
      />

      <h1 className="page-title" style={{ fontSize: '1.85rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <CoveMark size={30} />
        {displayName ? `${displayName}'s Dashboard` : 'Dashboard'}
      </h1>

      <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--color-text-muted)', fontSize: '1rem', lineHeight: 1.5, margin: '-0.25rem 0 1.5rem' }}>
        {dailyLine}
      </p>

      <div className="dash-tabs" role="tablist" aria-label="Dashboard sections">
        <button
          type="button"
          role="tab"
          aria-selected={dashTab === 'overview'}
          className={`dash-tab ${dashTab === 'overview' ? 'dash-tab--active' : ''}`}
          onClick={() => setDashTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={dashTab === 'tickets'}
          className={`dash-tab ${dashTab === 'tickets' ? 'dash-tab--active' : ''}`}
          onClick={() => setDashTab('tickets')}
        >
          Tickets
          {tickets.filter(t => t.status === 'new').length > 0 && (
            <span className="badge">{tickets.filter(t => t.status === 'new').length}</span>
          )}
        </button>
      </div>

      {dashTab === 'overview' && (
      <>

      {/* Concierge number — prominent */}
      {conciergeNumber ? (
        <div className="concierge-card">
          <div className="concierge-card-top">
            <div>
              <p className="concierge-card-label">Your Cove Number</p>
              <p className="concierge-card-number" style={{ letterSpacing: '0.12em' }}>{formatPhone(conciergeNumber)}</p>
            </div>
            <button className="btn btn-ghost concierge-card-copy" onClick={copyNumber} title="Copy number">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </button>
          </div>
          <p className="concierge-card-instruction">
            Forward all calls to this number. Trusted contacts ring through. Unknown callers get screened.
          </p>
          <button className="btn btn-ghost concierge-card-link" onClick={() => navigate('/forwarding')}>
            View setup instructions →
          </button>
        </div>
      ) : (
        <div className="concierge-card concierge-card--pending">
          <p className="concierge-card-label">Your Cove Number</p>
          <p className="concierge-card-number concierge-card-number--pending">
            {provisioningStatus === 'failed' ? 'Provisioning failed' : 'Provisioning…'}
          </p>
          <button className="btn btn-ghost" style={{ marginTop: '0.5rem' }} onClick={() => navigate('/forwarding')}>
            Check status →
          </button>
        </div>
      )}

      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* GREEN — trusted contacts (collapsible) */}
      <section className="kernel-section card section-card">
        <button type="button" className="section-toggle" onClick={() => toggleSection('green')} aria-expanded={openSections.green}>
          <span className="section-dot section-dot--green"></span>
          <span className="kernel-section-title">GREEN — Trusted</span>
          <span className="badge badge-green">{greenList.length}</span>
          <Chevron open={openSections.green} />
        </button>
        {openSections.green && (
          <div className="section-body">
            <p className="hint" style={{ textAlign: 'right', marginTop: 0 }}>Connect live immediately</p>
            {greenList.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No GREEN numbers yet.</p>
            ) : (
              greenList.map(c => (
                <div key={c.id} className="kernel-row">
                  <div className="kernel-row-meta">
                    <strong>{c.contact_name || formatPhone(c.phone_number)}</strong>
                    {c.contact_name && <span>{formatPhone(c.phone_number)}</span>}
                  </div>
                  <div className="kernel-actions">
                    <button className="btn btn-ghost" onClick={() => handleDeleteCallerList(c.id)}>Remove</button>
                  </div>
                </div>
              ))
            )}
            <div className="kernel-inline-form">
              <div className="field">
                <label>Phone</label>
                <input type="tel" value={greenPhone} onChange={e => setGreenPhone(e.target.value)} placeholder="+16195551234" />
              </div>
              <div className="field">
                <label>Name (optional)</label>
                <input value={greenName} onChange={e => setGreenName(e.target.value)} placeholder="Mom" />
              </div>
              <button className="btn btn-primary" onClick={() => handleAddCallerList('green')}>Add to GREEN</button>
            </div>
          </div>
        )}
      </section>

      {/* YELLOW — screening (collapsible) */}
      <section className="kernel-section card section-card">
        <button type="button" className="section-toggle" onClick={() => toggleSection('yellow')} aria-expanded={openSections.yellow}>
          <span className="section-dot section-dot--yellow"></span>
          <span className="kernel-section-title">YELLOW — Screening</span>
          <span className="badge">{questions.length}/{MAX_QUESTIONS}</span>
          <Chevron open={openSections.yellow} />
        </button>
        {openSections.yellow && (
          <div className="section-body">
            {/* Voice identity — name + greeting */}
            <div style={{ marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
                <h3 className="kernel-section-title" style={{ margin: 0, fontSize: '1.05rem' }}>Voice</h3>
                <span className="hint" style={{ margin: 0 }}>{'{name}'} inserts your name</span>
              </div>
              {/* Name row */}
              {displayNameDraft !== null ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <input
                    value={displayNameDraft}
                    onChange={e => setDisplayNameDraft(e.target.value)}
                    style={{ flex: 1 }}
                    placeholder="Dmitry the architect"
                    aria-label="Your name"
                  />
                  <button className="btn btn-primary" onClick={saveDisplayName}>Save</button>
                  <button className="btn btn-ghost" onClick={() => setDisplayNameDraft(null)}>Cancel</button>
                </div>
              ) : (
                <div className="kernel-row" style={{ alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div className="kernel-row-meta" style={{ flex: 1 }}>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginRight: '0.5rem' }}>Name</span>
                    <strong>{displayName || 'Not set'}</strong>
                  </div>
                  <div className="kernel-actions">
                    <button className="btn btn-ghost" onClick={() => setDisplayNameDraft(displayName)}>Edit</button>
                  </div>
                </div>
              )}
              {/* Greeting row */}
              {greetingDraft !== null ? (
                <>
                  <textarea
                    value={greetingDraft}
                    onChange={e => setGreetingDraft(e.target.value)}
                    rows={3}
                    style={{ width: '100%', marginBottom: '0.5rem' }}
                    placeholder="Hello, this is Cove, {name}'s assistant."
                    aria-label="Greeting"
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <button className="btn btn-primary" onClick={saveGreeting}>Save</button>
                    <button className="btn btn-ghost" onClick={() => setGreetingDraft(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <div className="kernel-row" style={{ alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div className="kernel-row-meta" style={{ flex: 1 }}>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginRight: '0.5rem' }}>Greeting</span>
                    <span>{greeting || 'No greeting set.'}</span>
                  </div>
                  <div className="kernel-actions">
                    <button className="btn btn-ghost" onClick={() => setGreetingDraft(greeting)}>Edit</button>
                  </div>
                </div>
              )}
              {(greetingDraft !== null ? greetingDraft : greeting) && (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0 0 0.35rem', fontStyle: 'italic' }}>
                  “{(greetingDraft !== null ? greetingDraft : greeting).replace(/\{name\}/g, displayNameDraft !== null ? displayNameDraft : (displayName || '{name}'))}”
                </p>
              )}
              <p className="hint" style={{ margin: 0 }}>
                Keep the recording notice in your greeting — it’s required in two-party consent states, including California.
              </p>
            </div>
            {/* Questions */}
            <div style={{ marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
                <h3 className="kernel-section-title" style={{ margin: 0, fontSize: '1.05rem' }}>Questions</h3>
                <span className="hint" style={{ margin: 0 }}>Asked in order · answers recorded</span>
              </div>
            {questions.length === 0 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-danger)', marginBottom: '1rem' }}>No questions set — unknown callers can&apos;t reach you at all right now. Add at least one.</p>
            )}
            {questions.map(q => (
              <div key={q.id} className="kernel-row" style={{ alignItems: 'flex-start' }}>
                <div className="kernel-row-meta" style={{ flex: 1 }}>
                  <strong style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                    <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>{q.ord}.</span>
                    {questionDrafts[q.id] !== undefined ? (
                      <input
                        value={questionDrafts[q.id]}
                        onChange={e => setQuestionDrafts(d => ({ ...d, [q.id]: e.target.value }))}
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <span>{q.question}</span>
                    )}
                  </strong>
                </div>
                <div className="kernel-actions">
                  {questionDrafts[q.id] !== undefined ? (
                    <>
                      <button className="btn btn-ghost" onClick={() => saveQuestion(q)}>Save</button>
                      <button className="btn btn-ghost" onClick={() => setQuestionDrafts(d => { const n = { ...d }; delete n[q.id]; return n; })}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-ghost" onClick={() => startEditQuestion(q)}>Edit</button>
                      <button className="btn btn-ghost" onClick={() => deleteQuestion(q)}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {questions.length < MAX_QUESTIONS && (
              <div className="kernel-inline-form">
                <div className="field">
                  <label>New question</label>
                  <input value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="Who is calling, please?" />
                </div>
                <button className="btn btn-primary" onClick={addQuestion}>Add</button>
              </div>
            )}
            </div>

          </div>
        )}
      </section>

      {/* What callers hear — live conversation preview, notifications, test call */}
      <section className="kernel-section card section-card" aria-label="What callers hear">
        <h2 className="kernel-section-title" style={{ marginBottom: '0.25rem' }}>What callers hear</h2>
        <p className="hint" style={{ textAlign: 'left', marginTop: 0, marginBottom: '1rem' }}>
          A live preview — it updates as you edit your greeting and questions. Example caller shown.
        </p>

        <div className="convo-preview">
          <div className="convo-line convo-line--cove">
            <span className="convo-speaker">Cove</span>
            <p>{previewGreeting}</p>
          </div>
          <div className="convo-line convo-line--caller">
            <span className="convo-speaker">Caller</span>
            <p>Hi, it&rsquo;s Alex — is Dmitry there?</p>
          </div>
          {questions.map(q => (
            <div key={q.id} className="convo-line convo-line--cove">
              <span className="convo-speaker">Cove</span>
              <p>{q.question}</p>
            </div>
          ))}
          <div className="convo-line convo-line--cove">
            <span className="convo-speaker">Cove</span>
            <p>{KERNEL_CLOSE}</p>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--color-border)' }}>
          <NotificationsPanel />
        </div>

        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--color-border)' }}>
          <h3 className="kernel-section-title" style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Try it yourself</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', lineHeight: 1.55, marginBottom: '0.9rem' }}>
            We&rsquo;ll call your real number from your Cove number, so you hear exactly what a caller hears.
            Limited to 3 test calls a day.
          </p>
          <button
            className="btn btn-primary"
            onClick={handleTestCall}
            disabled={testCallState === 'calling'}
            style={{ width: '100%' }}
          >
            {testCallState === 'calling' ? 'Calling…' : testCallState === 'done' ? 'Call again' : 'Call me now'}
          </button>
          {testCallMsg && (
            <p style={{ fontSize: '0.9rem', color: 'var(--color-success)', marginTop: '0.6rem' }}>{testCallMsg}</p>
          )}
        </div>
      </section>

      {/* RED — rejected (collapsible) */}
      <section className="kernel-section card section-card">
        <button type="button" className="section-toggle" onClick={() => toggleSection('red')} aria-expanded={openSections.red}>
          <span className="section-dot section-dot--red"></span>
          <span className="kernel-section-title">RED — Blocked</span>
          <span className="badge badge-red">{redList.length}</span>
          <Chevron open={openSections.red} />
        </button>
        {openSections.red && (
          <div className="section-body">
            <p className="hint" style={{ textAlign: 'right', marginTop: 0 }}>Rejected immediately</p>
            {redList.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No RED numbers yet.</p>
            ) : (
              redList.map(c => (
                <div key={c.id} className="kernel-row">
                  <div className="kernel-row-meta">
                    <strong>{c.contact_name || formatPhone(c.phone_number)}</strong>
                    {c.contact_name && <span>{formatPhone(c.phone_number)}</span>}
                  </div>
                  <div className="kernel-actions">
                    <button className="btn btn-ghost" onClick={() => handleDeleteCallerList(c.id)}>Remove</button>
                  </div>
                </div>
              ))
            )}
            <div className="kernel-inline-form">
              <div className="field">
                <label>Phone</label>
                <input type="tel" value={redPhone} onChange={e => setRedPhone(e.target.value)} placeholder="+16195551234" />
              </div>
              <div className="field">
                <label>Name (optional)</label>
                <input value={redName} onChange={e => setRedName(e.target.value)} placeholder="Spam caller" />
              </div>
              <button className="btn btn-primary" onClick={() => handleAddCallerList('red')}>Add to RED</button>
            </div>
          </div>
        )}
      </section>

      {/* Calls — history (tickets live in the Tickets tab) */}
      <section className="kernel-section" id="calls">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 className="kernel-section-title" style={{ margin: 0 }}>Calls</h2>
          {tickets.filter(t => t.status === 'new').length > 0 && (
            <button
              className="btn btn-ghost"
              style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
              onClick={() => setDashTab('tickets')}
            >
              {tickets.filter(t => t.status === 'new').length} new ticket{tickets.filter(t => t.status === 'new').length === 1 ? '' : 's'} to review
            </button>
          )}
        </div>
        <>
        <div className="filter-row">
          {CALL_OUTCOMES.map(f => (
            <button
              key={f}
              className={`btn ${callFilter === f ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
              onClick={() => setCallFilter(f)}
            >
              {f === 'all' ? 'All' : OUTCOME_LABELS[f] || f}
            </button>
          ))}
        </div>
        {filteredCalls.length === 0 ? (
          <div className="card-quiet" style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: 'var(--color-text-muted)' }}>No calls yet. Make sure your number is forwarded to Cove.</p>
            <button className="btn btn-ghost" style={{ marginTop: '1rem' }} onClick={() => navigate('/forwarding')}>
              View forwarding instructions
            </button>
          </div>
        ) : (
          <div className="call-list">
            {filteredCalls.map(call => (
              <div
                key={call.id}
                className="call-row"
                onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{call.caller_name || call.caller_number || 'Unknown'}</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      {new Date(call.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className={`badge badge-${call.outcome}`}>
                    {OUTCOME_LABELS[call.outcome] || call.outcome}
                  </span>
                </div>
                {expandedCall === call.id && (() => {
                  const linkedTicket = tickets.find(t => t.call_sid === call.call_sid) || tickets.find(t => t.id === call.ticket_id);
                  return (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-rule)' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem', marginBottom: '0.75rem' }}>
                      {call.caller_number && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>From: <strong style={{ color: 'var(--color-text)' }}>{call.caller_number}</strong></span>
                      )}
                      {call.duration != null && call.duration > 0 && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Duration: {Math.floor(call.duration / 60)}m {call.duration % 60}s</span>
                      )}
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Status: <strong style={{ color: 'var(--color-text)' }}>{OUTCOME_LABELS[call.outcome] || call.outcome}</strong></span>
                      {linkedTicket && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Ticket: <strong style={{ color: 'var(--color-text)' }}>{TICKET_STATUS_LABELS[linkedTicket.status] || linkedTicket.status}</strong>{linkedTicket.ended_reason ? ` · ${ENDED_REASON_LABELS[linkedTicket.ended_reason] || linkedTicket.ended_reason}` : ''}</span>
                      )}
                    </div>
                    {call.summary ? (
                      <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>{call.summary}</p>
                    ) : linkedTicket ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>No summary yet — open the call summary for the recording and transcript.</p>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>No details available for this call.</p>
                    )}
                    {call.transcript && (
                      <details>
                        <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Full transcript</summary>
                        <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap', color: 'var(--color-text-muted)' }}>{call.transcript}</p>
                      </details>
                    )}
                    {call.voicemail_url && (() => {
                      const sid = (call.voicemail_url.match(/Recordings\/([A-Za-z0-9]+)/) || [])[1];
                      return sid ? <RecordingPlayer recordingSid={sid} /> : null;
                    })()}
                    {linkedTicket && (
                      <button className="btn btn-ghost" style={{ marginTop: '0.75rem', padding: '0.4rem 0.9rem', fontSize: '0.8rem' }} onClick={() => {
                        const t = linkedTicket;
                        setCallsView('review');
                        setTicketFilter('all');
                        setExpandedTicket(t.id);
                        setDashTab('tickets');
                        if (!ticketAnswers[t.id]) {
                          setTicketAnswersLoading(s => ({ ...s, [t.id]: true }));
                          getReviewTicketAnswers(t.id)
                            .then(answers => setTicketAnswers(prev => ({ ...prev, [t.id]: answers })))
                            .catch(() => {})
                            .finally(() => setTicketAnswersLoading(s => ({ ...s, [t.id]: false })));
                        }
                      }}>Open ticket →</button>
                    )}
                  </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
        </>
      </section>

      {/* Webhooks */}
      <section className="kernel-section card section-card">
        <button type="button" className="section-toggle" onClick={() => toggleSection('webhooks')} aria-expanded={openSections.webhooks}>
          <span className="section-dot section-dot--green"></span>
          <span className="kernel-section-title">Webhooks</span>
          {webhookUrl.trim() && <span className="badge badge-green">on</span>}
          <Chevron open={openSections.webhooks} />
        </button>
        {openSections.webhooks && (
          <div className="section-body">
            <p className="hint" style={{ textAlign: 'left', marginTop: 0 }}>Every completed ticket is posted here as JSON — connect Zapier or Make to reach your CRM, Slack, or spreadsheets.</p>
            <div className="field">
              <label>Webhook URL</label>
              <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/…" />
            </div>
            <div className="field">
              <label>Signing secret</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input value={webhookSecret} readOnly placeholder="Generated when you save" style={{ flex: 1 }} />
                <button className="btn btn-ghost" onClick={regenerateWebhookSecret}>Regenerate</button>
              </div>
              <p className="hint">Each post is signed: the X-Cove-Signature header carries the HMAC-SHA256 of the body.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={saveWebhook}>Save</button>
              <button className="btn btn-ghost" onClick={testWebhook} disabled={!webhookUrl.trim()}>Send test</button>
              {webhookMsg && <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{webhookMsg}</span>}
            </div>
          </div>
        )}
      </section>
      </>)}
      )}

      {dashTab === 'tickets' && (
      <section className="kernel-section" id="tickets">
        <h2 className="kernel-section-title" style={{ marginBottom: '1rem' }}>
          Tickets
          <span className="hint" style={{ marginLeft: '0.75rem' }}>{tickets.length} total</span>
        </h2>
        <div className="filter-row" style={{ marginBottom: '1rem' }}>
          {TICKET_FILTERS.map(f => (
            <button
              key={f}
              className={`btn ${ticketFilter === f ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
              onClick={() => setTicketFilter(f)}
            >
              {f === 'all' ? 'All' : TICKET_STATUS_LABELS[f] || f}
            </button>
          ))}
        </div>
        {filteredTickets.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>All caught up — nothing here.</p>
        ) : (
          <div className="ticket-list">
            {filteredTickets.map(t => {
              const d = new Date(t.created_at);
              return (
                <div key={t.id} className={`ticket ticket--${t.status}${t.urgent ? ' ticket--urgent' : ''}`}>
                  <div className="ticket-stub" onClick={() => toggleTicket(t)}>
                    <span className="ticket-stub-day">{d.getDate()}</span>
                    <span className="ticket-stub-month">{d.toLocaleString('en-US', { month: 'short' })}</span>
                    {t.urgent
                      ? <span className="badge badge-urgent">Urgent</span>
                      : <span className={`badge badge-${t.status}`}>{TICKET_STATUS_LABELS[t.status] || t.status}</span>}
                  </div>
                  <div className="ticket-body" onClick={() => toggleTicket(t)}>
                    <p className="ticket-caller">{t.caller_name || formatPhone(t.caller_number) || 'Unknown caller'}</p>
                    <p className="ticket-meta">
                      {t.caller_name && t.caller_number ? `${formatPhone(t.caller_number)} · ` : ''}
                      {d.toLocaleString()}
                      {t.ended_reason ? ` · ${ENDED_REASON_LABELS[t.ended_reason] || t.ended_reason}` : ''}
                    </p>
                    {expandedTicket !== t.id && t.summary && <p className="ticket-summary">{t.summary}</p>}
                    {expandedTicket === t.id && (
                      <div className="ticket-detail" onClick={e => e.stopPropagation()}>
                        {t.summary && <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>{t.summary}</p>}
                        {ticketAnswersLoading[t.id] ? (
                          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Loading answers…</p>
                        ) : ticketAnswers[t.id]?.length ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            {ticketAnswers[t.id].map((a, i) => (
                              <div key={i} style={{ fontSize: '0.82rem' }}>
                                <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Q{a.question_ord}{a.attempt > 1 ? ` (attempt ${a.attempt})` : ''}: {a.question_text}</p>
                                {a.transcription_status && a.transcription_status !== 'completed' && (
                                  <p style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Transcription: {a.transcription_status}</p>
                                )}
                                {a.transcript && (
                                  <p style={{ color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>{a.transcript}</p>
                                )}
                                {a.recording_sid && (
                                  <RecordingPlayer recordingSid={a.recording_sid} />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>No answers captured.</p>
                        )}
                        <div className="ticket-actions">
                          {t.caller_number && (
                            <>
                              <button className="btn btn-ghost" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => moveToList(t, 'green')}><span className="section-dot section-dot--green" style={{ width: '0.5rem', height: '0.5rem' }} /> GREEN</button>
                              <button className="btn btn-ghost" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => moveToList(t, 'red')}><span className="section-dot section-dot--red" style={{ width: '0.5rem', height: '0.5rem' }} /> RED</button>
                            </>
                          )}
                          {t.status !== 'reviewed' && t.status !== 'actioned' && (
                            <button className="btn btn-ghost" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }} onClick={() => setTicketStatus(t, 'reviewed')}>Reviewed</button>
                          )}
                          {t.status !== 'actioned' && (
                            <button className="btn btn-primary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }} onClick={() => setTicketStatus(t, 'actioned')}>Done</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}
      <AppFooter />
    </main>
  );
}
