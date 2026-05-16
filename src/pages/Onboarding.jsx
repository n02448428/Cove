import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function Onboarding() {
  const navigate = useNavigate();
  const [realPhone, setRealPhone] = useState('');
  const [contacts, setContacts] = useState('');
  const [urgentKeywords, setUrgentKeywords] = useState('urgent, emergency, call me back');
  const [blockKeywords, setBlockKeywords] = useState('spam, survey, robocall');
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Parse trusted contacts: "Name +1xxx" one per line
      const parsedContacts = contacts
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const parts = line.split(/\s+/);
          const phone = parts[parts.length - 1];
          const name = parts.slice(0, -1).join(' ') || phone;
          return { user_id: user.id, name, phone };
        });

      // Upsert screening rules
      const { error: rulesErr } = await supabase.from('screening_rules').upsert({
        user_id: user.id,
        urgent_keywords: urgentKeywords.split(',').map(k => k.trim()).filter(Boolean),
        block_keywords: blockKeywords.split(',').map(k => k.trim()).filter(Boolean),
        email_notifications: emailNotifs,
      }, { onConflict: 'user_id' });
      if (rulesErr) throw rulesErr;

      // Insert trusted contacts
      if (parsedContacts.length > 0) {
        const { error: contactsErr } = await supabase.from('trusted_contacts').upsert(parsedContacts, { onConflict: 'user_id,phone' });
        if (contactsErr) throw contactsErr;
      }

      // Upsert user profile with real phone
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: user.id,
        real_phone: realPhone.trim(),
        provisioning_status: 'pending',
      }, { onConflict: 'id' });
      if (profileErr) throw profileErr;

      navigate('/forwarding');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <div style={{ width: '100%', maxWidth: 480, padding: '2rem', background: '#111', borderRadius: 16, boxShadow: '0 4px 32px #0006' }}>
        <h2 style={{ marginBottom: 8, fontSize: 24, fontWeight: 700 }}>Set up your Cove</h2>
        <p style={{ marginBottom: 24, color: '#aaa', fontSize: 14 }}>Takes about 2 minutes.</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Your Real Phone Number</label>
            <input
              type="tel"
              value={realPhone}
              onChange={e => setRealPhone(e.target.value)}
              placeholder="+16195551234"
              required
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Trusted callers and urgent calls will ring this number.</p>
          </div>
          <div className="field">
            <label>Trusted Contacts</label>
            <textarea
              value={contacts}
              onChange={e => setContacts(e.target.value)}
              placeholder={"Mom +16195550001\nDad +16195550002"}
              rows={4}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>One per line: Name +1XXXXXXXXXX</p>
          </div>
          <div className="field">
            <label>Urgent Keywords (connect immediately)</label>
            <input value={urgentKeywords} onChange={e => setUrgentKeywords(e.target.value)} placeholder="urgent, emergency" />
          </div>
          <div className="field">
            <label>Block Keywords (end call)</label>
            <input value={blockKeywords} onChange={e => setBlockKeywords(e.target.value)} placeholder="spam, survey" />
          </div>
          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <input type="checkbox" id="emailNotifs" checked={emailNotifs} onChange={e => setEmailNotifs(e.target.checked)} style={{ width: 'auto' }} />
            <label htmlFor="emailNotifs" style={{ margin: 0, textTransform: 'none', letterSpacing: 'normal', fontSize: '0.9rem', color: 'var(--color-text)' }}>Email me new voicemail summaries</label>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </main>
  );
}
