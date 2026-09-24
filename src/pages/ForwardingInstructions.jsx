import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { formatPhone } from '../lib/format.js';
import AppHeader from '../components/AppHeader.jsx';
import AppFooter from '../components/AppFooter.jsx';
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
  // NOTE: *21* is the GSM standard (AT&T, T-Mobile, most carriers worldwide).
  // Verizon uses *72<number> to enable and *73 to disable.
  const digitsOnly = (conciergeNumber || '').replace(/\D/g, '');
  const enableCode = digitsOnly ? `*21*${digitsOnly}#` : '';
  const enableTelLink = digitsOnly ? `tel:*21*${digitsOnly}%23` : '';
  const disableTelLink = 'tel:%2321%23'; // ##21#
  const verizonEnableCode = digitsOnly ? `*72${digitsOnly}` : '';
  const verizonEnableTelLink = digitsOnly ? `tel:*72${digitsOnly}` : '';
  const verizonDisableTelLink = 'tel:*73';

  function copyText(text) {
    if (text) navigator.clipboard.writeText(text);
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

  const displayNumberFormatted = conciergeNumber ? formatPhone(conciergeNumber) : displayNumber;

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
        <p style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '0.12em' }}>{displayNumberFormatted}</p>
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
          Works on AT&amp;T, T-Mobile, and most carriers worldwide.
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
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.5, marginBottom: '1rem' }}>
              Dials <code style={{ fontSize: '0.85rem' }}>{enableCode}</code><br />
              Your phone will confirm “Call forwarding enabled.”
            </p>
            <details>
              <summary style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', cursor: 'pointer', textAlign: 'center' }}>
                On Verizon? Tap here
              </summary>
              <div style={{ marginTop: '0.75rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '0.75rem', textAlign: 'center' }}>
                  Verizon uses different codes. Tap below, then hit <strong>call</strong>.
                </p>
                <a
                  href={verizonEnableTelLink}
                  className="btn btn-ghost"
                  style={{ width: '100%', textDecoration: 'none', textAlign: 'center', display: 'block' }}
                >
                  📞 Turn on forwarding (Verizon)
                </a>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
                  Dials <code style={{ fontSize: '0.85rem' }}>{verizonEnableCode}</code>
                </p>
              </div>
            </details>
          </>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Waiting for your Cove number…</p>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontWeight: 700, marginBottom: '0.75rem', fontSize: '1rem' }}>On a computer or tablet?</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '1rem' }}>
          Open your phone&apos;s dialer and dial the code below manually, then hit <strong>call</strong>.
        </p>
        {conciergeNumber ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <code style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.06em' }}>{enableCode}</code>
              <button className="btn btn-ghost" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => copyText(enableCode)}>
                Copy
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              Verizon customers dial <code style={{ fontSize: '0.85rem' }}>{verizonEnableCode}</code> instead.
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
          style={{ width: '100%', textDecoration: 'none', textAlign: 'center', display: 'block', marginBottom: '0.75rem' }}
        >
          Turn off forwarding
        </a>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: '0.75rem' }}>
          Dials <code style={{ fontSize: '0.85rem' }}>##21#</code>
        </p>
        <details>
          <summary style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', cursor: 'pointer', textAlign: 'center' }}>
            On Verizon? Tap here
          </summary>
          <div style={{ marginTop: '0.75rem' }}>
            <a
              href={verizonDisableTelLink}
              className="btn btn-ghost"
              style={{ width: '100%', textDecoration: 'none', textAlign: 'center', display: 'block' }}
            >
              Turn off forwarding (Verizon)
            </a>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
              Dials <code style={{ fontSize: '0.85rem' }}>*73</code>
            </p>
          </div>
        </details>
      </div>

      <details style={{ marginBottom: '1.5rem' }}>
        <summary style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
          Codes not working? Read this
        </summary>
        <div className="card" style={{ marginTop: '0.75rem' }}>
          <ul style={{ paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.9 }}>
            <li><strong>AT&amp;T / T-Mobile / most carriers:</strong> use the <code>*21*</code> codes above.</li>
            <li><strong>Verizon:</strong> use <code>*72</code> to forward and <code>*73</code> to cancel. The <code>*21*</code> codes don&apos;t work on Verizon.</li>
            <li><strong>iPhone Settings → Phone → Call Forwarding:</strong> only appears on some carriers. If you don&apos;t see it, use the dial codes above instead.</li>
            <li><strong>Android:</strong> the forwarding menu varies by brand and is often controlled by your carrier — dial codes are more reliable.</li>
            <li><strong>Outside the US:</strong> <code>*21*</code> is the GSM standard and usually works, but some carriers differ. If a code fails, contact your carrier and ask for their unconditional call-forwarding code.</li>
            <li>Some prepaid or business plans block forwarding codes — your carrier can confirm.</li>
          </ul>
        </div>
      </details>

      <div className="card" style={{ marginBottom: '2rem', background: 'var(--color-surface-subtle, transparent)' }}>
        <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.9rem' }}>Good to know</h3>
        <ul style={{ paddingLeft: '1.25rem', fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.8 }}>
          <li>Standard carrier charges may apply for forwarded calls. Cove numbers are currently US-based — forwarding from non-US numbers may incur international charges.</li>
          <li>Calls answered by Cove may be recorded and transcribed. You&apos;re responsible for complying with call-recording laws where you and your callers are located.</li>
          <li>Cove screens calls but can&apos;t block every unwanted call, and can&apos;t guarantee every important call connects. If you&apos;re expecting something urgent, turn forwarding off.</li>
          <li>Cove is not a replacement for emergency services. Always dial emergency numbers directly from your phone.</li>
        </ul>
      </div>

      <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/dashboard')} disabled={!conciergeNumber && needsCheckout}>
        I&apos;ve set it up → Go to Dashboard
      </button>
      <AppFooter />
    </main>
  );
}
