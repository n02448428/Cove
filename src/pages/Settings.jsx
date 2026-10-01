import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { toE164, isValidE164, E164_ERROR } from '../lib/phone.js';
import AppHeader from '../components/AppHeader.jsx';
import AppFooter from '../components/AppFooter.jsx';
import CoveMark from '../components/CoveMark.jsx';
import { createPortalSession } from '../services/api.js';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function Settings() {
  const navigate = useNavigate();
  const [realPhone, setRealPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushState, setPushState] = useState('unknown'); // unknown | on | off | unsupported
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const [showHowItWorks, setShowHowItWorks] = useState(false);
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
        supabase.from('phone_numbers').select('real_number').eq('user_id', user.id).maybeSingle(),
        supabase.from('profiles').select('stripe_customer_id, subscription_status, display_name, notify_email').eq('id', user.id).maybeSingle(),
      ]);

      if (phoneRes.data) {
        setRealPhone(phoneRes.data.real_number || '');
      }
      if (profileRes.data) {
        setBilling({
          stripeCustomerId: profileRes.data.stripe_customer_id || null,
          subscriptionStatus: profileRes.data.subscription_status || null,
        });
        setDisplayName(profileRes.data.display_name || '');
        setEmailNotifs(profileRes.data.notify_email ?? true);
      }

      try {
        if ('serviceWorker' in navigator && 'PushManager' in window && VAPID_PUBLIC_KEY) {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          setPushState(sub ? 'on' : 'off');
        } else {
          setPushState('unsupported');
        }
      } catch {
        setPushState('unsupported');
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
      }, { onConflict: 'user_id' });
      if (phoneErr) throw phoneErr;

      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        display_name: displayName.trim() || null,
      }, { onConflict: 'id' });
      if (profileErr) throw profileErr;

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleEmailToggle(e) {
    const next = e.target.checked;
    setEmailNotifs(next);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error: upErr } = await supabase.from('profiles').update({ notify_email: next }).eq('id', user.id);
      if (upErr) throw upErr;
    } catch {
      setEmailNotifs(!next);
      setPushError("Couldn't save that. Try again.");
    }
  }

  async function handleEnablePush() {
    setPushError('');
    setPushBusy(true);
    try {
      if (!VAPID_PUBLIC_KEY) throw new Error("Push isn't set up yet.");
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Push is blocked. Allow it in your browser settings, then try again.');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      const j = sub.toJSON();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in.');
      const { error: insErr } = await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: j.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
      }, { onConflict: 'endpoint' });
      if (insErr) throw insErr;
      setPushState('on');
    } catch (err) {
      setPushError(err.message || 'Something went wrong.');
    } finally {
      setPushBusy(false);
    }
  }

  async function handleDisablePush() {
    setPushError('');
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setPushState('off');
    } catch (err) {
      setPushError(err.message || 'Something went wrong.');
    } finally {
      setPushBusy(false);
    }
  }

  function handlePushToggle(e) {
    if (e.target.checked) handleEnablePush();
    else handleDisablePush();
  }

  if (loading) return <main className="page-narrow"><p style={{ color: 'var(--color-text-muted)' }}>Loading...</p></main>;

  return (
    <main className="page-narrow">
      <AppHeader
        homeTo="/dashboard"
        actions={<button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>Back</button>}
      />
      <h2 className="page-title" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <CoveMark size={30} />
        Settings
      </h2>

      <div className="card section-card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
          RED &amp; GREEN lists and screening questions now live on the{' '}
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
          <label>Display Name</label>
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Visionary Minds" maxLength={60} />
          <p className="hint">Callers hear “Cove, {displayName.trim() || 'your name'}'s assistant”. Leave blank to use your email name.</p>
        </div>
        <div className="field">
          <label>Your Real Phone Number</label>
          <input type="tel" value={realPhone} onChange={e => setRealPhone(e.target.value)} placeholder="+16195551234" />
          <p className="hint">Trusted callers ring this number. 10-digit US numbers are fine (we add +1).</p>
        </div>
        {error && <p className="error-msg">{error}</p>}
        {success && <p style={{ color: 'var(--color-success)', fontSize: '0.85rem' }}>Saved.</p>}
        <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: '100%', marginTop: '0.5rem' }}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </form>

      <section className="card section-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '1.25rem', marginBottom: '0.5rem' }}>Notifications</h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', lineHeight: 1.55, marginBottom: '1rem' }}>
          We email you after every call. Want your phone to buzz too? Both are your call — flip either one anytime.
        </p>

        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input type="checkbox" id="emailNotifs" checked={emailNotifs} onChange={handleEmailToggle} style={{ width: 'auto' }} />
          <label htmlFor="emailNotifs" style={{ margin: 0, textTransform: 'none', letterSpacing: 'normal', fontSize: '0.9rem', color: 'var(--color-text)' }}>
            Email me after every call
          </label>
        </div>

        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
          <input type="checkbox" id="pushNotifs" checked={pushState === 'on'} onChange={handlePushToggle} disabled={pushBusy || pushState === 'unsupported' || pushState === 'unknown'} style={{ width: 'auto' }} />
          <label htmlFor="pushNotifs" style={{ margin: 0, textTransform: 'none', letterSpacing: 'normal', fontSize: '0.9rem', color: 'var(--color-text)' }}>
            Buzz my phone after every call
          </label>
        </div>
        {pushState === 'unsupported' && (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            Push isn't available in this browser.
          </p>
        )}
        {pushError && <p className="error-msg" style={{ marginTop: '0.5rem' }}>{pushError}</p>}

        <button type="button" className="btn-text" onClick={() => setShowHowItWorks(true)} style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
          How this works
        </button>
      </section>

      {showHowItWorks && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setShowHowItWorks(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: 100 }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '22rem', padding: '1.5rem' }}
          >
            <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '1.2rem', marginBottom: '0.75rem' }}>How this works</h3>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '0.75rem' }}>
              After each call, Cove emails you what the caller said — so you never miss a thing.
            </p>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '0.75rem' }}>
              Turn on push and your phone buzzes too. No app needed — iPhone just needs one extra step first: in Safari, tap Share, then Add to Home Screen. Then you're all set.
            </p>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1rem' }}>
              How your calls are handled never changes — this only changes how we let you know.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => setShowHowItWorks(false)} style={{ width: '100%' }}>
              Got it
            </button>
          </div>
        </div>
      )}
      <AppFooter />
    </main>
  );
}
