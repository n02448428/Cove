import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Email + push notification controls. Lives on the Dashboard, directly beneath
// the "What callers hear" preview. Email preference is profiles.notify_email;
// push is the presence of a Web Push subscription in push_subscriptions.
export default function NotificationsPanel() {
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushState, setPushState] = useState('unknown'); // unknown | on | off | unsupported
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('notify_email')
        .eq('id', user.id)
        .maybeSingle();
      if (data && typeof data.notify_email === 'boolean') {
        setEmailNotifs(data.notify_email);
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
    }
    load();
  }, []);

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

  return (
    <div className="notifications-panel">
      <h3 className="kernel-section-title" style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Notifications</h3>
      <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', lineHeight: 1.55, marginBottom: '1rem' }}>
        We let you know after every call. Email, a buzz on your phone, or both — flip either one anytime.
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
    </div>
  );
}
