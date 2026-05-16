import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function Settings() {
  const navigate = useNavigate();
  const [realPhone, setRealPhone] = useState('');
  const [contacts, setContacts] = useState('');
  const [urgentKeywords, setUrgentKeywords] = useState('');
  const [blockKeywords, setBlockKeywords] = useState('');
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, rulesRes, contactsRes] = await Promise.all([
        supabase.from('user_profiles').select('real_phone').eq('id', user.id).maybeSingle(),
        supabase.from('screening_rules').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('trusted_contacts').select('name,phone').eq('user_id', user.id),
      ]);

      if (profileRes.data) setRealPhone(profileRes.data.real_phone || '');
      if (rulesRes.data) {
        setUrgentKeywords((rulesRes.data.urgent_keywords || []).join(', '));
        setBlockKeywords((rulesRes.data.block_keywords || []).join(', '));
        setEmailNotifs(rulesRes.data.email_notifications ?? true);
      }
      if (contactsRes.data) {
        setContacts(contactsRes.data.map(c => `${c.name} ${c.phone}`).join('\n'));
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

      await supabase.from('user_profiles').upsert({ id: user.id, real_phone: realPhone.trim() }, { onConflict: 'id' });
      await supabase.from('screening_rules').upsert({
        user_id: user.id,
        urgent_keywords: urgentKeywords.split(',').map(k => k.trim()).filter(Boolean),
        block_keywords: blockKeywords.split(',').map(k => k.trim()).filter(Boolean),
        email_notifications: emailNotifs,
      }, { onConflict: 'user_id' });

      const parsedContacts = contacts.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
        const parts = line.split(/\s+/);
        const phone = parts[parts.length - 1];
        const name = parts.slice(0, -1).join(' ') || phone;
        return { user_id: user.id, name, phone };
      });
      if (parsedContacts.length > 0) {
        await supabase.from('trusted_contacts').upsert(parsedContacts, { onConflict: 'user_id,phone' });
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <h2 style={{ fontWeight: 800, fontSize: '1.5rem' }}>Settings</h2>
        <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>Back</button>
      </div>

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
