import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import AppHeader from '../components/AppHeader.jsx';

function toE164(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return trimmed.replace(/\s+/g, '');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return trimmed.startsWith('+') ? trimmed : `+${digits}`;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [realPhone, setRealPhone] = useState('');
  const [contacts, setContacts] = useState('');
  const [urgentKeywords, setUrgentKeywords] = useState(
    'emergency, accident, hospital, urgent, 911, police, fire, ambulance, school'
  );
  const [blockKeywords, setBlockKeywords] = useState(
    'survey, warranty, offer, loan, credit, investment, sales, marketing, promotion, solicitor'
  );
  const [smsNotifs, setSmsNotifs] = useState(false);
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

      const realNumber = toE164(realPhone);
      if (!/^\+[1-9]\d{1,14}$/.test(realNumber)) {
        throw new Error('Enter your real phone in E.164 format, e.g. +16195551234');
      }

      const parsedContacts = contacts
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const parts = line.split(/\s+/);
          const phone = toE164(parts[parts.length - 1]);
          const name = parts.slice(0, -1).join(' ') || phone;
          return {
            user_id: user.id,
            contact_name: name,
            phone_number: phone,
          };
        });

      for (const c of parsedContacts) {
        if (!/^\+[1-9]\d{1,14}$/.test(c.phone_number)) {
          throw new Error(`Invalid trusted contact number: ${c.phone_number}`);
        }
      }

      // screening_rules: urgent_keywords + block_keywords only (per migration)
      const { error: rulesErr } = await supabase.from('screening_rules').upsert({
        user_id: user.id,
        urgent_keywords: urgentKeywords.split(',').map(k => k.trim()).filter(Boolean),
        block_keywords: blockKeywords.split(',').map(k => k.trim()).filter(Boolean),
      }, { onConflict: 'user_id' });
      if (rulesErr) throw rulesErr;

      // Replace trusted contacts (no unique constraint for upsert)
      const { error: delErr } = await supabase
        .from('trusted_contacts')
        .delete()
        .eq('user_id', user.id);
      if (delErr) throw delErr;

      if (parsedContacts.length > 0) {
        const { error: contactsErr } = await supabase
          .from('trusted_contacts')
          .insert(parsedContacts);
        if (contactsErr) throw contactsErr;
      }

      // phone_numbers owns real_number, notify flags, provisioning_status
      // Keep existing twilio_number if already provisioned (do not wipe live number)
      const { data: existingPhone } = await supabase
        .from('phone_numbers')
        .select('id, twilio_number, provisioning_status')
        .eq('user_id', user.id)
        .maybeSingle();

      const phonePayload = {
        user_id: user.id,
        real_number: realNumber,
        notify_sms: smsNotifs,
        notify_email: emailNotifs,
        provisioning_status: existingPhone?.provisioning_status === 'active' ? 'active' : 'pending',
      };

      const { error: phoneErr } = await supabase
        .from('phone_numbers')
        .upsert(phonePayload, { onConflict: 'user_id' });
      if (phoneErr) throw phoneErr;

      navigate('/forwarding');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-narrow">
      <AppHeader homeTo="/" />
      <div className="card">
        <h2 style={{ marginBottom: 8, fontSize: 24, fontWeight: 700 }}>Set up your Cove</h2>
        <p style={{ marginBottom: 24, color: 'var(--color-text-muted)', fontSize: 14 }}>Takes about 2 minutes.</p>
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
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Trusted callers ring this number. Use E.164 (+1…).</p>
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
            <input type="checkbox" id="smsNotifs" checked={smsNotifs} onChange={e => setSmsNotifs(e.target.checked)} style={{ width: 'auto' }} />
            <label htmlFor="smsNotifs" style={{ margin: 0, textTransform: 'none', letterSpacing: 'normal', fontSize: '0.9rem', color: 'var(--color-text)' }}>SMS me new voicemail summaries</label>
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
