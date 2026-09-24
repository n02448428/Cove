import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { toE164, isValidE164, isValidCode, E164_ERROR, CODE_ERROR } from '../lib/phone.js';
import AppHeader from '../components/AppHeader.jsx';
import CoveMark from '../components/CoveMark.jsx';
import {
  getCallerLists,
  addCallerList,
  deleteCallerList,
  getAccessCodes,
  addAccessCode,
  revokeAccessCode,
  deleteAccessCode,
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

  // kernel data
  const [callerLists, setCallerLists] = useState([]);
  const [accessCodes, setAccessCodes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [calls, setCalls] = useState([]);

  // concierge number
  const [conciergeNumber, setConciergeNumber] = useState('');
  const [provisioningStatus, setProvisioningStatus] = useState('');

  // collapsible sections
  const [openSections, setOpenSections] = useState({ green: true, yellow: true, red: false });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // call log
  const [expandedCall, setExpandedCall] = useState(null);
  const [callFilter, setCallFilter] = useState('all');

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

  // access code form
  const [codeValue, setCodeValue] = useState('');
  const [codeLabel, setCodeLabel] = useState('');

  // question editing
  const [questionDrafts, setQuestionDrafts] = useState({});
  const [newQuestion, setNewQuestion] = useState('');

  // greeting editing
  const [greeting, setGreeting] = useState('');
  const [greetingDraft, setGreetingDraft] = useState(null);

  const loadAll = useCallback(async (uid) => {
    const [lists, codes, qs, tix, logs, phone, profile] = await Promise.all([
      getCallerLists(uid),
      getAccessCodes(uid),
      getScreeningQuestions(uid),
      getReviewTickets(uid),
      getCallLogs(uid, { limit: 100 }),
      supabase.from('phone_numbers').select('twilio_number, provisioning_status').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('profiles').select('greeting').eq('id', uid).maybeSingle(),
    ]);
    setCallerLists(lists);
    setAccessCodes(codes);
    setQuestions(qs);
    setTickets(tix);
    setCalls(logs);
    setGreeting(profile.data?.greeting || '');
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

  function copyNumber() {
    if (conciergeNumber) navigator.clipboard.writeText(conciergeNumber);
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

  // — Access codes ————————————————————————————————
  async function handleAddCode() {
    setError('');
    if (!isValidCode(codeValue)) {
      setError(CODE_ERROR);
      return;
    }
    try {
      const added = await addAccessCode(userId, { code: codeValue, label: codeLabel });
      setAccessCodes(prev => [added, ...prev]);
      setCodeValue('');
      setCodeLabel('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRevokeCode(id) {
    setError('');
    try {
      const updated = await revokeAccessCode(id);
      setAccessCodes(prev => prev.map(c => (c.id === id ? updated : c)));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteCode(id) {
    setError('');
    try {
      await deleteAccessCode(id);
      setAccessCodes(prev => prev.filter(c => c.id !== id));
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

  const filteredTickets = ticketFilter === 'all' ? tickets : tickets.filter(t => t.status === ticketFilter);

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
        Dashboard
      </h1>

      {/* Concierge number — prominent */}
      {conciergeNumber ? (
        <div className="concierge-card">
          <div className="concierge-card-top">
            <div>
              <p className="concierge-card-label">Your Cove Number</p>
              <p className="concierge-card-number">{conciergeNumber}</p>
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
            <p className="hint">Numbers on this list connect live immediately.</p>
            {greenList.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No GREEN numbers yet.</p>
            ) : (
              greenList.map(c => (
                <div key={c.id} className="kernel-row">
                  <div className="kernel-row-meta">
                    <strong>{c.contact_name || c.phone_number}</strong>
                    {c.contact_name && <span>{c.phone_number}</span>}
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
            {/* Custom greeting — the first thing callers hear */}
            <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
              <h3 className="kernel-section-title" style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Greeting</h3>
              <p className="hint" style={{ marginTop: 0 }}>The first thing unknown callers hear. Use {'{name}'} to insert your display name.</p>
              {greetingDraft !== null ? (
                <>
                  <textarea
                    value={greetingDraft}
                    onChange={e => setGreetingDraft(e.target.value)}
                    rows={3}
                    style={{ width: '100%', marginBottom: '0.5rem' }}
                    placeholder="Hello, this is Cove, {name}'s assistant."
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" onClick={saveGreeting}>Save greeting</button>
                    <button className="btn btn-ghost" onClick={() => setGreetingDraft(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <div className="kernel-row" style={{ alignItems: 'flex-start' }}>
                  <div className="kernel-row-meta" style={{ flex: 1 }}>
                    <span>{greeting || 'No greeting set.'}</span>
                  </div>
                  <div className="kernel-actions">
                    <button className="btn btn-ghost" onClick={() => setGreetingDraft(greeting)}>Edit</button>
                  </div>
                </div>
              )}
            </div>
            <p className="hint">Unknown callers are asked these questions after the greeting. 1–5 questions, spoken verbatim. Use {'{name}'} for your display name.</p>
            {questions.length === 0 && (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>No questions yet. Add up to 5.</p>
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
                <button className="btn btn-primary" onClick={addQuestion}>Add question</button>
              </div>
            )}

            {/* Access codes inside YELLOW section */}
            <div className="yellow-subsection">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <h3 className="kernel-section-title" style={{ margin: 0, fontSize: '1.05rem' }}>Access codes</h3>
                <span className="badge badge-green">{accessCodes.filter(c => !c.revoked_at).length}</span>
              </div>
              <p className="hint" style={{ marginTop: 0, marginBottom: '1rem' }}>Callers in YELLOW can enter a code to connect live.</p>
              {accessCodes.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No access codes yet.</p>
              ) : (
                accessCodes.map(c => (
                  <div key={c.id} className="kernel-row">
                    <div className="kernel-row-meta">
                      <strong>{c.code}{c.label ? ` — ${c.label}` : ''}</strong>
                      <span>
                        {c.revoked_at ? 'revoked' : 'active'}
                        {c.last_used_at ? ` · last used ${new Date(c.last_used_at).toLocaleDateString()}` : ''}
                        {c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleDateString()}` : ''}
                      </span>
                    </div>
                    <div className="kernel-actions">
                      {!c.revoked_at && (
                        <button className="btn btn-ghost" onClick={() => handleRevokeCode(c.id)}>Revoke</button>
                      )}
                      <button className="btn btn-ghost" onClick={() => handleDeleteCode(c.id)}>Delete</button>
                    </div>
                  </div>
                ))
              )}
              <div className="kernel-inline-form">
                <div className="field">
                  <label>Code</label>
                  <input inputMode="numeric" value={codeValue} onChange={e => setCodeValue(e.target.value)} placeholder="1234" />
                </div>
                <div className="field">
                  <label>Label (optional)</label>
                  <input value={codeLabel} onChange={e => setCodeLabel(e.target.value)} placeholder="Family" />
                </div>
                <button className="btn btn-primary" onClick={handleAddCode}>Add code</button>
              </div>
            </div>
          </div>
        )}
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
            <p className="hint">Numbers on this list are rejected immediately.</p>
            {redList.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No RED numbers yet.</p>
            ) : (
              redList.map(c => (
                <div key={c.id} className="kernel-row">
                  <div className="kernel-row-meta">
                    <strong>{c.contact_name || c.phone_number}</strong>
                    {c.contact_name && <span>{c.phone_number}</span>}
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

      {/* Review tickets */}
      <section className="kernel-section card section-card" id="review-tickets">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <h2 className="kernel-section-title" style={{ margin: 0 }}>Review tickets</h2>
          <span className="badge">{tickets.length}</span>
        </div>
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
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No review tickets yet.</p>
        ) : (
          <div className="call-list">
            {filteredTickets.map(t => (
              <div key={t.id} className="call-row" onClick={() => toggleTicket(t)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontWeight: 600 }}>{t.caller_name || t.caller_number || 'Unknown caller'}</p>
                    {t.caller_name && t.caller_number && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{t.caller_number}</p>
                    )}
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      {new Date(t.created_at).toLocaleString()}
                      {t.ended_reason ? ` · ${ENDED_REASON_LABELS[t.ended_reason] || t.ended_reason}` : ''}
                    </p>
                  </div>
                  <span className={`badge badge-${t.status}`}>{TICKET_STATUS_LABELS[t.status] || t.status}</span>
                </div>
                {expandedTicket === t.id && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-rule)' }} onClick={e => e.stopPropagation()}>
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
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                      {t.caller_number && (
                        <>
                          <button className="btn btn-ghost" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => moveToList(t, 'green')}><span className="section-dot section-dot--green" style={{ width: '0.5rem', height: '0.5rem' }} /> Add to GREEN</button>
                          <button className="btn btn-ghost" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => moveToList(t, 'red')}><span className="section-dot section-dot--red" style={{ width: '0.5rem', height: '0.5rem' }} /> Add to RED</button>
                        </>
                      )}
                      {t.status !== 'reviewed' && t.status !== 'actioned' && (
                        <button className="btn btn-ghost" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }} onClick={() => setTicketStatus(t, 'reviewed')}>Mark reviewed</button>
                      )}
                      {t.status !== 'actioned' && (
                        <button className="btn btn-primary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }} onClick={() => setTicketStatus(t, 'actioned')}>Mark actioned</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Call log */}
      <section className="kernel-section">
        <h2 className="kernel-section-title">Call log</h2>
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
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>No summary yet — open the review ticket for recording and transcript.</p>
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
                        setExpandedTicket(t.id);
                        if (!ticketAnswers[t.id]) {
                          setTicketAnswersLoading(s => ({ ...s, [t.id]: true }));
                          getReviewTicketAnswers(t.id)
                            .then(answers => setTicketAnswers(prev => ({ ...prev, [t.id]: answers })))
                            .catch(() => {})
                            .finally(() => setTicketAnswersLoading(s => ({ ...s, [t.id]: false })));
                        }
                        document.getElementById('review-tickets')?.scrollIntoView({ behavior: 'smooth' });
                      }}>View review ticket →</button>
                    )}
                  </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
