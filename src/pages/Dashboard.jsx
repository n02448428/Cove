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

export default function Dashboard() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState(null);

  // kernel data
  const [callerLists, setCallerLists] = useState([]);
  const [accessCodes, setAccessCodes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [calls, setCalls] = useState([]);

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

  const loadAll = useCallback(async (uid) => {
    const [lists, codes, qs, tix, logs] = await Promise.all([
      getCallerLists(uid),
      getAccessCodes(uid),
      getScreeningQuestions(uid),
      getReviewTickets(uid),
      getCallLogs(uid, { limit: 100 }),
    ]);
    setCallerLists(lists);
    setAccessCodes(codes);
    setQuestions(qs);
    setTickets(tix);
    setCalls(logs);
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
      <p className="page-lede" style={{ marginBottom: '2rem' }}>
        RED numbers are rejected. GREEN numbers connect live. Everyone else is screened with your questions and a review ticket is created.
      </p>

      {error && <p className="error-msg" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* RED list */}
      <section className="kernel-section card section-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <h2 className="kernel-section-title" style={{ margin: 0 }}>RED list</h2>
          <span className="badge badge-red">{redList.length}</span>
        </div>
        <p className="hint" style={{ marginTop: 0, marginBottom: '1rem' }}>Numbers on this list are rejected immediately.</p>
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
      </section>

      {/* GREEN list + access codes */}
      <section className="kernel-section card section-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <h2 className="kernel-section-title" style={{ margin: 0 }}>GREEN list</h2>
          <span className="badge badge-green">{greenList.length}</span>
        </div>
        <p className="hint" style={{ marginTop: 0, marginBottom: '1rem' }}>Numbers on this list connect live immediately.</p>
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

        {/* Access codes inside GREEN section */}
        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-rule)' }}>
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
      </section>

      {/* Questions */}
      <section className="kernel-section card section-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <h2 className="kernel-section-title" style={{ margin: 0 }}>Questions</h2>
          <span className="badge">{questions.length}/{MAX_QUESTIONS}</span>
        </div>
        <p className="hint" style={{ marginTop: 0, marginBottom: '1rem' }}>Spoken verbatim to unscreened callers. 1–5 questions.</p>
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
      </section>

      {/* Review tickets */}
      <section className="kernel-section card section-card">
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
                            {a.recording_url && (
                              <audio controls src={a.recording_url} style={{ marginTop: '0.4rem', width: '100%' }} />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>No answers captured.</p>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
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
                {expandedCall === call.id && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-rule)' }}>
                    {call.summary && <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>{call.summary}</p>}
                    {call.transcript && (
                      <details>
                        <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Full transcript</summary>
                        <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap', color: 'var(--color-text-muted)' }}>{call.transcript}</p>
                      </details>
                    )}
                    {call.voicemail_url && (
                      <audio controls src={call.voicemail_url} style={{ marginTop: '0.75rem', width: '100%' }} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
