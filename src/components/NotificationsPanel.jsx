import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const MODES = [
  { id: 'instant', label: 'Every call', hint: 'An email the moment each call wraps.' },
  { id: 'daily', label: 'Daily digest', hint: 'One email with all your calls.' },
  { id: 'urgent', label: 'Urgent now, rest daily', hint: 'Urgent calls instantly, everything else in the digest.' },
  { id: 'off', label: 'None', hint: 'No emails. You check tickets yourself.' },
];

// Email notification preferences. Email is Cove's notification method:
// the user picks how often, and at what time the digest lands.
// Kernel v0.4: per-classification toggles filter WHAT gets emailed.
export default function NotificationsPanel() {
  const [mode, setMode] = useState('instant');
  const [digestTime, setDigestTime] = useState('08:00');
  const [emailLead, setEmailLead] = useState(true);
  const [emailCustomer, setEmailCustomer] = useState(true);
  const [emailSolicitation, setEmailSolicitation] = useState(false);
  const [emailUrgent, setEmailUrgent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('email_mode, digest_time')
        .eq('id', user.id)
        .maybeSingle();
      if (data) {
        // Back-compat: the old notify_email=false becomes 'off' via migration;
        // anything unexpected falls back to 'instant'.
        const m = ['off', 'instant', 'daily', 'urgent'].includes(data.email_mode) ? data.email_mode : 'instant';
        setMode(m);
        if (data.digest_time) setDigestTime(String(data.digest_time).slice(0, 5));
      }
      const { data: phone } = await supabase
        .from('phone_numbers')
        .select('notify_email_lead, notify_email_customer, notify_email_solicitation, notify_email_urgent')
        .eq('user_id', user.id)
        .maybeSingle();
      if (phone) {
        setEmailLead(phone.notify_email_lead ?? true);
        setEmailCustomer(phone.notify_email_customer ?? true);
        setEmailSolicitation(phone.notify_email_solicitation ?? false);
        setEmailUrgent(phone.notify_email_urgent ?? true);
      }
    }
    load();
  }, []);

  async function save(nextMode, nextTime) {
    setSaving(true);
    setError('');
    setSavedNote('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
      const { error: upErr } = await supabase.from('profiles').update({
        email_mode: nextMode,
        digest_time: nextTime,
        timezone: tz,
      }).eq('id', user.id);
      if (upErr) throw upErr;
      setMode(nextMode);
      setDigestTime(nextTime);
      setSavedNote('Saved.');
    } catch (err) {
      setError(err.message || "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveToggles(next) {
    setSaving(true);
    setError('');
    setSavedNote('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');
      const { error: upErr } = await supabase.from('phone_numbers').update({
        notify_email_lead: next.lead,
        notify_email_customer: next.customer,
        notify_email_solicitation: next.solicitation,
        notify_email_urgent: next.urgent,
      }).eq('user_id', user.id);
      if (upErr) throw upErr;
      setEmailLead(next.lead);
      setEmailCustomer(next.customer);
      setEmailSolicitation(next.solicitation);
      setEmailUrgent(next.urgent);
      setSavedNote('Saved.');
    } catch (err) {
      setError(err.message || "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(key) {
    const next = {
      lead: emailLead,
      customer: emailCustomer,
      solicitation: emailSolicitation,
      urgent: emailUrgent,
    };
    next[key] = !next[key];
    saveToggles(next);
  }

  function pickMode(id) {
    if (id === mode || saving) return;
    save(id, digestTime);
  }

  function pickTime(t) {
    if (!t || saving) return;
    save(mode, t);
  }

  const needsTime = mode === 'daily' || mode === 'urgent';

  return (
    <div className="notifications-panel">
      <h3 className="kernel-section-title" style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Email me</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: needsTime ? '0.9rem' : '0.25rem' }}>
        {MODES.map(m => (
          <label
            key={m.id}
            style={{
              display: 'flex', gap: '0.7rem', alignItems: 'flex-start',
              padding: '0.7rem 0.85rem', borderRadius: '0.75rem',
              border: `1px solid ${mode === m.id ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: mode === m.id ? 'rgba(64,145,140,0.07)' : 'transparent',
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            <input
              type="radio"
              name="email-mode"
              checked={mode === m.id}
              onChange={() => pickMode(m.id)}
              disabled={saving}
              style={{ width: 'auto', marginTop: '0.2rem' }}
            />
            <span>
              <span style={{ display: 'block', fontWeight: 600, fontSize: '0.92rem' }}>{m.label}</span>
              <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>{m.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {needsTime && (
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <label htmlFor="digestTime" style={{ margin: 0, textTransform: 'none', letterSpacing: 'normal', fontSize: '0.9rem', color: 'var(--color-text)' }}>
            Digest arrives at
          </label>
          <input
            id="digestTime"
            type="time"
            value={digestTime}
            onChange={e => pickTime(e.target.value)}
            disabled={saving}
            style={{ width: 'auto' }}
          />
        </div>
      )}

      {error && <p className="error-msg" style={{ marginTop: '0.5rem' }}>{error}</p>}
      {savedNote && !error && (
        <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>{savedNote}</p>
      )}

      <h3 className="kernel-section-title" style={{ margin: '1.25rem 0 0.5rem', fontSize: '1.05rem' }}>What to email about</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {[
          { key: 'lead', label: 'New leads', checked: emailLead },
          { key: 'customer', label: 'Existing customers', checked: emailCustomer },
          { key: 'solicitation', label: 'Solicitations', checked: emailSolicitation },
          { key: 'urgent', label: 'Urgent calls (overrides above)', checked: emailUrgent },
        ].map(t => (
          <label
            key={t.key}
            style={{
              display: 'flex', gap: '0.7rem', alignItems: 'center',
              padding: '0.6rem 0.85rem', borderRadius: '0.75rem',
              border: '1px solid var(--color-border)',
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={t.checked}
              onChange={() => toggle(t.key)}
              disabled={saving}
              style={{ width: 'auto' }}
            />
            <span style={{ fontSize: '0.9rem' }}>{t.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
