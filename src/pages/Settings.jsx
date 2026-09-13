import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { toE164, isValidE164, E164_ERROR } from '../lib/phone.js';
import AppHeader from '../components/AppHeader.jsx';
import { createPortalSession } from '../services/api.js';

export default function Settings() {
  const navigate = useNavigate();
  const [realPhone, setRealPhone] = useState('');
  const [smsNotifs, setSmsNotifs] = useState(false);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [billing, setBilling] = useState({ stripeCustomerId: null, subscriptionStatus: null });
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [phoneRes, profileRes] = await Promise.all([
        supabase.from('phone_numbers').select('real_number, notify_sms, notify_email').eq('user_id', user.id).maybeSingle(),
        supabase.from('profiles').select('stripe_customer_id, subscription_status').eq('id', user.id).maybeSingle(),
      ]);

      if (phoneRes.data) {
        setRealPhone(phoneRes.data.real_number || '');
        setSmsNotifs(!!phoneRes.data.notify_sms);
        setEmailNotifs(phoneRes.data.notify_email ?? true);
      }
      if (profileRes.data) {
        setBilling({
          stripeCustomerId: profileRes.data.stripe_customer_id || null,
          subscriptionStatus: profileRes.data.subscription_status || null,
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  const showBilling =
    !!billing.stripeCustomerId ||
    (!!billing.subscriptionStatus && billing.subscriptionStatus !== 'none');

  async function handleManageBilling() {
    setPortalError('');
    setPortalLoading(true);
    try {
      const { url } = await createPortalSession();
      window.location.assign(url);
    } catch (err) {
      setPortalError(err.message || 'Could not open billing portal');
      setPortalLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const realNumber = toE164(realPhone);
      if (realNumber && !isValidE164(realNumber)) {
        throw new Error(E164_ERROR);
      }

      const { error: phoneErr } = await supabase.from('phone_numbers').upsert({
        user_id: user.id,
        real_number: realNumber,
        notify_sms: smsNotifs,
        notify_email: emailNotifs,
      }, { onConflict: 'user_id' });
      if (phoneErr) throw phoneErr;

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
      <h2 className="page-title" style={{ marginBottom: '1.5rem' }}>Settings</h2>

      <div className="card section-card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
          RED &amp; GREEN lists, access codes, and screening questions now live on the{' '}
          <button className="btn-text" onClick={() => navigate('/dashboard')} style={{ fontSize: '0.85rem' }}>Dashboard</button>.
        </p>
      </div>

      {showBilling && (
        <div className="card section-card" style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '1.25rem', marginBottom: '0.5rem' }}>Billing</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem', lineHeight: 1.55 }}>
            Cancel, update your card, or view invoices in the Customer Portal. Number stays yours while subscribed; 30-day grace if you cancel.
            {billing.subscriptionStatus ? (
              <> Status: <strong>{billing.subscriptionStatus}</strong>.</>
            ) : null}
          </p>
          {portalError && <p className="error-msg">{portalError}</p>}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleManageBilling}
            disabled={portalLoading}
            style={{ width: '100%' }}
          >
            {portalLoading ? 'Opening…' : 'Manage billing'}
          </button>
        </div>
      )}

      <form className="card section-card" onSubmit={handleSave}>
        <div className="field">
          <label>Your Real Phone Number</label>
          <input type="tel" value={realPhone} onChange={e => setRealPhone(e.target.value)} placeholder="+16195551234" />
          <p className="hint">Trusted callers ring this number. 10-digit US numbers are fine (we add +1).</p>
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
