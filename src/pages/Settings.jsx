import { useEffect, useState } from 'react';
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

export default function Settings() {
  const navigate = useNavigate();
  const [realPhone, setRealPhone] = useState('');
  const [contacts, setContacts] = useState('');
  const [urgentKeywords, setUrgentKeywords] = useState('');
  const [blockKeywords, setBlockKeywords] = useState('');
  const [smsNotifs, setSmsNotifs] = useState(false);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [phoneRes, rulesRes, contactsRes] = await Promise.all([
        supabase.from('phone_numbers').select('real_number, notify_sms, notify_email').eq('user_id', user.id).maybeSingle(),
        supabase.from('screening_rules').select('urgent_keywords, block_keywords').eq('user_id', user.id).maybeSingle(),
        supabase.from('trusted_contacts').select('contact_name, phone_number').eq('user_id', user.id),
      ]);

      if (phoneRes.data) {
        setRealPhone(phoneRes.data.real_number || '');
        setSmsNotifs(!!phoneRes.data.notify_sms);
        setEmailNotifs(phoneRes.data.notify_email ?? true);
      }
      if (rulesRes.data) {
        setUrgentKeywords((rulesRes.data.urgent_keywords || []).join(', '));
        setBlockKeywords((rulesRes.data.block_keywords || []).join(', '));
      }
      if (contactsRes.data) {
        setContacts(contactsRes.data.map(c => `${c.contact_name} ${c.phone_number}`).join('\n'));
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const realNumber = toE164(realPhone);
      if (realNumber && !/^\+[1-9]\d{1,14}$/.test(realNumber)) {
        throw new Error('Enter your real phone in E.164 format, e.g. +16195551234');
      }

      const { error: phoneErr } = await supabase.from('phone_numbers').upsert({
        user_id: user.id,
        real_number: realNumber,
        notify_sms: smsNotifs,
        notify_email: emailNotifs,
      }, { onConflict: 'user_id' });
      if (phoneErr) throw phoneErr;

      const { error: rulesErr } = await supabase.from('screening_rules').upsert({
        user_id: user.id,
        urgent_keywords: urgentKeywords.split(',').map(k => k.trim()).filter(Boolean),
        block_keywords: blockKeywords.split(',').map(k => k.trim()).filter(Boolean),
      }, { onConflict: 'user_id' });
      if (rulesErr) throw rulesErr;

      const parsedContacts = contacts.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
        const parts = line.split(/\s+/);
        const phone = toE164(parts[parts.length - 1]);
        const name = parts.slice(0, -1).join(' ') || phone;
        return { user_id: user.id, contact_name: name, phone_number: phone };
      });
      for (const c of parsedContacts) {
        if (!/^\+[1-9]\d{1,14}$/.test(c.phone_number)) {
          throw new Error(`Invalid trusted contact number: ${c.phone_number}`);
        }
      }

      const { error: delErr } = await supabase.from('trusted_contacts').delete().eq('user_id', user.id);
      if (delErr) throw delErr;
      if (parsedContacts.length > 0) {
        const { error: contactsErr } = await supabase.from('trusted_contacts').insert(parsedContacts);
        if (contactsErr) throw contactsErr;
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="page-narrow"><p style={{ color: 'var(--color-text-muted)' }}>Loading...</p></main>;

  return (
    <main className="page-narrow">
      <AppHeader
        homeTo="/dashboard"
        actions={<button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>Back</button>}
      />
      <h2 style={{ fontWeight: 800, fontSize: '1.5rem', marginBottom: '1.5rem' }}>Settings</h2>

      <form className="card" onSubmit={handleSave}>
        <div className="field">
          <label>Your Real Phone Number</label>
          <input type="tel" value={realPhone} onChange={e => setRealPhone(e.target.value)} placeholder="+16195551234" />
        </div>
        <div className="field">
          <label>Trusted Contacts</label>
          <textarea value={contacts} onChange={e => setContacts(e.target.value)} rows={4} placeholder="Mom +16195550001" />
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>One per line: Name +1XXXXXXXXXX</p>
        </div>
        <div className="field">
          <label>Urgent Keywords</label>
          <input value={urgentKeywords} onChange={e => setUrgentKeywords(e.target.value)} />
        </div>
        <div className="field">
          <label>Block Keywords</label>
          <input value={blockKeywords} onChange={e => setBlockKeywords(e.target.value)} />
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input type="checkbox" id="smsNotifs" checked={smsNotifs} onChange={e => setSmsNotifs(e.target.checked)} style={{ width: 'auto' }} />
          <label htmlFor="smsNotifs" style={{ margin: 0, textTransform: 'none', letterSpacing: 'normal', fontSize: '0.9rem', color: 'var(--color-text)' }}>SMS notifications</label>
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input type="checkbox" id="emailNotifs" checked={emailNotifs} onChange={e => setEmailNotifs(e.target.checked)} style={{ width: 'auto' }} />
          <label htmlFor="emailNotifs" style={{ margin: 0, textTransform: 'none', letterSpacing: 'normal', fontSize: '0.9rem', color: 'var(--color-text)' }}>Email notifications</label>
        </div>
        {error && <p className="error-msg">{error}</p>}
        {success && <p style={{ color: 'var(--color-success)', fontSize: '0.85rem' }}>Saved.</p>}
        <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: '100%', marginTop: '0.5rem' }}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </main>
  );
}
