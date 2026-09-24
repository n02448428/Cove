import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import AppHeader from '../components/AppHeader.jsx';
import CoveMark from '../components/CoveMark.jsx';
import { createCheckoutSession } from '../services/api.js';

export default function ForwardingInstructions() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [conciergeNumber, setConciergeNumber] = useState('');
  const [provisioningStatus, setProvisioningStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const checkoutFlag = searchParams.get('checkout');

  const fetchNumber = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('phone_numbers')
      .select('twilio_number, provisioning_status')
      .eq('user_id', user.id)
      .maybeSingle();
    setProvisioningStatus(data?.provisioning_status || 'pending');
    setConciergeNumber(data?.twilio_number || '');
    setLoading(false);
    return data;
  }, []);

  useEffect(() => {
    fetchNumber();
  }, [fetchNumber]);

  // After successful checkout, poll until DID is provisioned
  useEffect(() => {
    if (checkoutFlag !== 'success') return;
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      if (cancelled) return;
      const data = await fetchNumber();
      if (data?.twilio_number && data?.provisioning_status === 'active') return;
      tries += 1;
      if (tries < 20) setTimeout(tick, 2000);
    };
    tick();
    return () => { cancelled = true; };
  }, [checkoutFlag, fetchNumber]);

  async function startCheckout() {
    setCheckoutError('');
    setCheckoutLoading(true);
    try {
      const { url } = await createCheckoutSession();
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err.message || 'Could not start checkout');
      setCheckoutLoading(false);
    }
  }

  function copyNumber() {
    if (conciergeNumber) navigator.clipboard.writeText(conciergeNumber);
  }

  // MMI code to enable unconditional call forwarding: *21*<number>#
  // The # must be URL-encoded as %23 for tel: links.
  const digitsOnly = (conciergeNumber || '').replace(/\D/g, '');
  const enableCode = digitsOnly ? `*21*${digitsOnly}#` : '';
  const enableTelLink = digitsOnly ? `tel:*21*${digitsOnly}%23` : '';
  const disableTelLink = 'tel:%2321%23'; // ##21#

  const needsCheckout =
    !conciergeNumber &&
    (provisioningStatus === 'pending' ||
      provisioningStatus === 'failed' ||
      checkoutFlag === 'needed' ||
      checkoutFlag === 'canceled');

  const displayNumber = loading
    ? 'Loading...'
    : conciergeNumber || (provisioningStatus === 'failed'
      ? 'Provisioning failed — contact support'
      : checkoutFlag === 'success'
        ? 'Provisioning your Cove number…'
        : 'Number provisioning pending…');

  return (
    <main className="page-narrow">
      <AppHeader homeTo="/dashboard" />
      <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <CoveMark size={30} />
        Forward your number
      </h2>
      <p className="page-lede">
        Send all your calls to Cove. Takes 10 seconds — no settings menus.
      </p>

      {checkoutFlag === 'success' && !conciergeNumber && (
        <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'var(--color-accent, #3b82f6)' }}>
          <p style={{ fontSize: '0.9rem' }}>Checkout complete — assigning your Cove number. This page updates automatically.</p>
        </div>
      )}

      {needsCheckout && (
        <div className="card section-card" style={{ marginBottom: '1.5rem' }}>
          <p className="price-block__eyebrow" style={{ marginBottom: '0.5rem' }}>Trial</p>
          <h3 className="price-block__primary" style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
            Try Cove free for 7 days. $49/mo after — cancel anytime.
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem', lineHeight: 1.55 }}>
            Card on file for the trial · your Cove number provisions after payment method is saved ·
            number stays yours while subscribed · 30-day grace if you cancel.
          </p>
          <p className="price-block__plan">7-day trial → $49/mo</p>
          {checkoutError && <p className="error-msg">{checkoutError}</p>}
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={startCheckout}
            disabled={checkoutLoading}
          >
            {checkoutLoading ? 'Redirecting…' : 'Continue to checkout'}
          </button>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Your Cove Number</p>
        <p style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '0.05em' }}>{displayNumber}</p>
        {conciergeNumber && (
          <button className="btn btn-ghost" style={{ marginTop: '1rem' }} onClick={copyNumber}>
            Copy number
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '1rem' }}>Step 1 — Turn on forwarding</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
          Tap the button below. Your phone dialer opens with the code filled in — just hit <strong>call</strong>.
          Works on iPhone and Android, any carrier.
        </p>
        {conciergeNumber ? (
          <>
            <a
              href={enableTelLink}
              className="btn btn-primary"
              style={{ width: '100%', textDecoration: 'none', textAlign: 'center', display: 'block', marginBottom: '0.75rem' }}
            >
              📞 Tap to turn on forwarding
            </a>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
              Dials <code style={{ fontSize: '0.85rem' }}>{enableCode}</code><br />
              Your phone will confirm “Call forwarding enabled.”
            </p>
          </>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Waiting for your Cove number…</p>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '1rem' }}>Step 2 — Test it</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Call your own phone number from another phone. Cove should answer — not your voicemail.
          If your old voicemail picks up, forwarding isn&apos;t on yet — repeat Step 1.
        </p>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '1rem' }}>Turn it off anytime</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
          Tap below to stop forwarding. Calls go back to ringing your phone directly.
        </p>
        <a
          href={disableTelLink}
          className="btn btn-ghost"
          style={{ width: '100%', textDecoration: 'none', textAlign: 'center', display: 'block' }}
        >
          Turn off forwarding
        </a>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
          Dials <code style={{ fontSize: '0.85rem' }}>##21#</code>
        </p>
      </div>

      <details style={{ marginBottom: '2rem' }}>
        <summary style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
          Prefer phone settings instead?
        </summary>
        <div className="card" style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
          <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.9rem' }}>iPhone</h3>
          <ol style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 2 }}>
            <li>Settings → Phone → Call Forwarding</li>
            <li>Turn it on, tap Forward To</li>
            <li>Enter your Cove number above</li>
          </ol>
        </div>
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Android</h3>
          <ol style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 2 }}>
            <li>Phone app → ⋮ menu → Settings → Call forwarding <span style={{ fontSize: '0.75rem' }}>(exact location varies by brand)</span></li>
            <li>Select “Always forward”</li>
            <li>Enter your Cove number above</li>
          </ol>
        </div>
      </details>

      <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/dashboard')} disabled={!conciergeNumber && needsCheckout}>
        I&apos;ve set it up → Go to Dashboard
      </button>
    </main>
  );
}
