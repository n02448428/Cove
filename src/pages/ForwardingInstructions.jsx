import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
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
      <h2 style={{ fontWeight: 800, fontSize: '1.5rem', marginBottom: '0.5rem' }}>Forward your number</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>
        Forward all calls to your Cove number. Carrier steps vary — undo anytime in your phone settings.
      </p>

      {checkoutFlag === 'success' && !conciergeNumber && (
        <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'var(--color-accent, #3b82f6)' }}>
          <p style={{ fontSize: '0.9rem' }}>Checkout complete — assigning your Cove number. This page updates automatically.</p>
        </div>
      )}

      {needsCheckout && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.95rem' }}>Start your 7-day trial</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            $49/mo after trial. Card required to start — your Cove number is provisioned once payment method is saved.
          </p>
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
        <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem' }}>iPhone</h3>
        <ol style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 2 }}>
          <li>Settings → Phone → Call Forwarding</li>
          <li>Turn on Call Forwarding</li>
          <li>Enter your Cove number above</li>
        </ol>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem' }}>Android</h3>
        <ol style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 2 }}>
          <li>Phone app → Settings → Calls → Call Forwarding</li>
          <li>Select &quot;Always forward&quot;</li>
          <li>Enter your Cove number above</li>
        </ol>
      </div>

      <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/dashboard')} disabled={!conciergeNumber && needsCheckout}>
        I&apos;ve set it up → Go to Dashboard
      </button>
    </main>
  );
}