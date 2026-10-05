import { Fragment, useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { toE164, isValidE164, E164_ERROR } from '../lib/phone.js';
import { formatPhone } from '../lib/format.js';
import {
  getScreeningQuestions,
  replaceScreeningQuestions,
} from '../services/api.js';

const MAX_QUESTIONS = 5;
const KERNEL_CLOSE = 'Thank you. I will pass this along. Goodbye from Cove.';

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

// KernelManager — "Who gets through": the call-handling kernel's configuration.
// Three calm rows (Trusted / Screening / Blocked); each expands to its management
// UI. The kernel itself (behavior) is untouched — this is only its controls.
export default function KernelManager({ userId, callerLists, onAddCallerList, onDeleteCallerList, onDisplayNameChange }) {
  const [openRows, setOpenRows] = useState({ trusted: false, screening: false, blocked: false });
  const [error, setError] = useState('');

  // questions
  const [questions, setQuestions] = useState([]);
  const [questionDrafts, setQuestionDrafts] = useState({});
  const [newQuestion, setNewQuestion] = useState('');

  // voice identity
  const [greeting, setGreeting] = useState('');
  const [greetingDraft, setGreetingDraft] = useState(null);
  const [templateIdx, setTemplateIdx] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [displayNameDraft, setDisplayNameDraft] = useState(null);

  // list forms
  const [greenPhone, setGreenPhone] = useState('');
  const [greenName, setGreenName] = useState('');
  const [redPhone, setRedPhone] = useState('');
  const [redName, setRedName] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [qs, profile] = await Promise.all([
        getScreeningQuestions(userId),
        supabase.from('profiles').select('greeting, display_name').eq('id', userId).maybeSingle(),
      ]);
      setQuestions(qs);
      setGreeting(profile.data?.greeting || '');
      setDisplayName(profile.data?.display_name || '');
    } catch (err) {
      setError(err.message);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  function toggleRow(row) {
    setOpenRows(prev => ({ ...prev, [row]: !prev[row] }));
  }

  const greenList = callerLists.filter(c => c.classification === 'green');
  const redList = callerLists.filter(c => c.classification === 'red');

  async function handleAdd(classification) {
    setError('');
    const phone = classification === 'red' ? redPhone : greenPhone;
    const name = classification === 'red' ? redName : greenName;
    const normalized = toE164(phone);
    if (!isValidE164(normalized)) {
      setError(E164_ERROR);
      return;
    }
    try {
      await onAddCallerList(classification, { phone_number: normalized, contact_name: name || null });
      if (classification === 'red') { setRedPhone(''); setRedName(''); }
      else { setGreenPhone(''); setGreenName(''); }
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveDisplayName() {
    setError('');
    const text = (displayNameDraft ?? '').trim();
    if (!text) { setError('Display name cannot be empty.'); return; }
    try {
      const { error } = await supabase.from('profiles').update({ display_name: text }).eq('id', userId);
      if (error) throw error;
      setDisplayName(text);
      setDisplayNameDraft(null);
      onDisplayNameChange?.(text);
    } catch (err) {
      setError(err.message);
    }
  }

  // Trigger voice regeneration after text changes. Fire-and-forget: the
  // audio updates in the background; the call flow falls back to the
  // basic voice if a clip isn't ready yet.
  async function refreshVoice(text) {
    try {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/regenerate-voice`;
      await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ user_id: userId, text }),
      });
    } catch {
      // Voice refresh is best-effort; the save already succeeded.
    }
  }


// Curated greeting templates — text-only previews, voice generates on save.
const GREETING_TEMPLATES = [
  "Thanks for calling. I\u2019m Cove, the AI receptionist. How can I help you today?",
  "Hello \u2014 I\u2019m Cove, answering for the office. Who\u2019s calling, please?",
  "Hi, this is Cove, {name}\u2019s assistant. They can\u2019t come to the phone right now \u2014 may I take a message?",
  "Hello \u2014 I\u2019m Cove, {name}\u2019s AI receptionist. What can I help you with?",
  "You\u2019ve reached {name}. I\u2019m Cove, and I\u2019ll make sure your message gets through. This call may be recorded.",
];

  async function saveGreeting() {
    setError('');
    const text = (greetingDraft ?? '').trim();
    if (!text) { setError('Greeting cannot be empty.'); return; }
    try {
      const { error } = await supabase.from('profiles').update({ greeting: text }).eq('id', userId);
      if (error) throw error;
      setGreeting(text);
      setGreetingDraft(null);
      refreshVoice(text.replace(/\{name\}/g, displayName || 'there'));
    } catch (err) {
      setError(err.message);
    }
  }

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
      refreshVoice(text);
    } catch (err) {
      setError(err.message);
    }
  }

  async function addQuestion() {
    setError('');
    const text = newQuestion.trim();
    if (!text) return;
    if (questions.length >= MAX_QUESTIONS) { setError(`Maximum ${MAX_QUESTIONS} questions reached.`); return; }
    try {
      const texts = [...questions.map(q => q.question), text];
      const fresh = await replaceScreeningQuestions(userId, texts);
      setQuestions(fresh);
      setNewQuestion('');
      refreshVoice(text);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteQuestion(q) {
    setError('');
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

  const DEFAULT_GREETING = "Hello, this is Cove, {name}'s assistant. This call may be recorded.";
  const previewName = displayNameDraft !== null ? displayNameDraft : (displayName || '{name}');
  const previewGreeting = ((greetingDraft ?? greeting) || DEFAULT_GREETING).replace(/\{name\}/g, previewName);

  function listRow(c) {
    return (
      <div key={c.id} className="kernel-row">
        <div className="kernel-row-meta">
          <strong>{c.contact_name || formatPhone(c.phone_number)}</strong>
          {c.contact_name && <span>{formatPhone(c.phone_number)}</span>}
        </div>
        <div className="kernel-actions">
          <button className="btn btn-ghost" onClick={() => onDeleteCallerList(c.id)}>Remove</button>
        </div>
      </div>
    );
  }

  function gateRow({ id, dot, label, hint, open }) {
    return (
      <div>
        <button
          type="button"
          className="gate-row-toggle"
          onClick={() => toggleRow(id)}
          aria-expanded={openRows[id]}
        >
          <span className={`dot ${dot}`}></span>
          <span className="gate-row-text">
            <span className="row-label">{label}</span>
            <span className="row-hint">{hint}</span>
          </span>
          <Chevron open={openRows[id]} />
        </button>
        {openRows[id] && open}
      </div>
    );
  }

  return (
    <div className="card section-card" style={{ marginBottom: '1.25rem' }}>
      <h3 className="kernel-section-title" style={{ margin: '0 0 0.75rem', fontSize: '1.05rem' }}>Who gets through</h3>
      {error && <p className="error-msg" style={{ marginBottom: '0.75rem' }}>{error}</p>}

      {gateRow({
        id: 'trusted',
        dot: 'dot--green',
        label: 'Trusted',
        hint: `${greenList.length} number${greenList.length === 1 ? '' : 's'} · ring straight through`,
        open: (
          <div className="gate-row-body">
            {greenList.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No trusted numbers yet.</p>
            ) : greenList.map(listRow)}
            <div className="kernel-inline-form">
              <div className="field">
                <label>Phone</label>
                <input type="tel" value={greenPhone} onChange={e => setGreenPhone(e.target.value)} placeholder="+16195551234" />
              </div>
              <div className="field">
                <label>Name (optional)</label>
                <input value={greenName} onChange={e => setGreenName(e.target.value)} placeholder="Mom" />
              </div>
              <button className="btn btn-primary" onClick={() => handleAdd('green')}>Add</button>
            </div>
          </div>
        ),
      })}

      {gateRow({
        id: 'screening',
        dot: 'dot--yellow',
        label: 'Screening',
        hint: `${questions.length} question${questions.length === 1 ? '' : 's'} · what callers hear`,
        open: (
          <div className="gate-row-body">
            {/* Voice identity */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Voice</h4>
                <span className="hint" style={{ margin: 0 }}>{'{name}'} inserts your name</span>
              </div>
              {displayNameDraft !== null ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <input value={displayNameDraft} onChange={e => setDisplayNameDraft(e.target.value)} style={{ flex: 1, minWidth: 0 }} placeholder="Dmitry the architect" aria-label="Your name" />
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
              {greetingDraft !== null ? (
                <>
                  <textarea value={greetingDraft} onChange={e => setGreetingDraft(e.target.value)} rows={3} style={{ width: '100%', marginBottom: '0.5rem' }} placeholder="Hello, this is Cove, {name}'s assistant." aria-label="Greeting" />
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={saveGreeting}>Save</button>
                    <button className="btn btn-ghost" onClick={() => setGreetingDraft(null)}>Cancel</button>
                    <button className="btn btn-ghost" onClick={() => {
                      const next = GREETING_TEMPLATES[templateIdx % GREETING_TEMPLATES.length];
                      setTemplateIdx(i => i + 1);
                      setGreetingDraft(next);
                    }}>Try another</button>
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
              <p className="hint" style={{ margin: 0 }}>Keep the recording notice — required in California and other two-party states.</p>
            </div>
            {/* Questions */}
            <div style={{ marginBottom: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 600 }}>Questions</h4>
              {questions.length === 0 && (
                <p style={{ fontSize: '0.85rem', color: 'var(--color-danger)', marginBottom: '1rem' }}>No questions set — unknown callers can&apos;t reach you at all right now. Add at least one.</p>
              )}
              {questions.map(q => (
                <div key={q.id} className="kernel-row" style={{ alignItems: 'flex-start' }}>
                  <div className="kernel-row-meta" style={{ flex: 1 }}>
                    <strong style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                      <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>{q.ord}.</span>
                      {questionDrafts[q.id] !== undefined ? (
                        <input value={questionDrafts[q.id]} onChange={e => setQuestionDrafts(d => ({ ...d, [q.id]: e.target.value }))} style={{ flex: 1, minWidth: 0 }} />
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
            {/* Script preview */}
            <div style={{ marginTop: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 600 }}>Current call flow</h4>
              <p className="hint" style={{ margin: '0 0 0.75rem' }}>What callers hear, in order.</p>
            <div className="convo-preview">
              <div className="convo-line convo-line--cove">
                <span className="convo-speaker">Cove</span>
                <p>{previewGreeting}</p>
              </div>
              {questions.map(q => (
                <Fragment key={q.id}>
                  <div className="convo-line convo-line--cove">
                    <span className="convo-speaker">Cove</span>
                    <p>{q.question}</p>
                  </div>
                  <div className="convo-line convo-line--caller">
                    <span className="convo-speaker">Caller</span>
                    <p>recorded</p>
                  </div>
                </Fragment>
              ))}
              <div className="convo-line convo-line--cove">
                <span className="convo-speaker">Cove</span>
                <p>{KERNEL_CLOSE}</p>
              </div>
            </div>
            </div>
          </div>
        ),
      })}

      {gateRow({
        id: 'blocked',
        dot: 'dot--red',
        label: 'Blocked',
        hint: `${redList.length} number${redList.length === 1 ? '' : 's'} · never ring`,
        open: (
          <div className="gate-row-body">
            {redList.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No blocked numbers yet.</p>
            ) : redList.map(listRow)}
            <div className="kernel-inline-form">
              <div className="field">
                <label>Phone</label>
                <input type="tel" value={redPhone} onChange={e => setRedPhone(e.target.value)} placeholder="+16195551234" />
              </div>
              <div className="field">
                <label>Name (optional)</label>
                <input value={redName} onChange={e => setRedName(e.target.value)} placeholder="Spam caller" />
              </div>
              <button className="btn btn-primary" onClick={() => handleAdd('red')}>Add</button>
            </div>
          </div>
        ),
      })}
    </div>
  );
}
