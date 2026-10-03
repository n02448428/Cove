import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { toE164, isValidE164, E164_ERROR } from '../lib/phone.js';
import AppHeader from '../components/AppHeader.jsx';
import AppFooter from '../components/AppFooter.jsx';
import CoveMark from '../components/CoveMark.jsx';
import { createPortalSession } from '../services/api.js';

export default function Settings() {
  const navigate = useNavigate();
  const [realPhone, setRealPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [billing, setBilling] = useState({ stripeCustomerId: null, subscriptionStatus: null });
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState('');

  // Webhooks (advanced) — collapsed by default
  const [showWebhooks, setShowWebhooks] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookMsg, setWebhookMsg] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [phoneRes, profileRes] = await Promise.all([
        supabase.from('phone_numbers').select('real_number').eq('user_id', user.id).maybeSingle(),
        supabase.from('profiles').select('stripe_customer_id, subscription_status, display_name, webhook_url, webhook_secret').eq('id', user.id).maybeSingle(),
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
        setWebhookUrl(profileRes.data.webhook_url || '');
        setWebhookSecret(profileRes.data.webhook_secret || '');
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

  // — Webhooks (advanced) —————————————————————————
  async function hmacHex(secret, body) {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret || ''),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function newSecret() {
    return [...crypto.getRandomValues(new Uint8Array(24))]
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function saveWebhook() {
    setError('');
    setWebhookMsg('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      let secret = webhookSecret;
      if (webhookUrl.trim() && !secret) {
        secret = newSecret();
        setWebhookSecret(secret);
      }
      const { error } = await supabase.from('profiles').update({
        webhook_url: webhookUrl.trim() || null,
        webhook_secret: secret || null,
      }).eq('id', user.id);
      if (error) throw error;
      setWebhookMsg('Saved.');
    } catch (err) {
      setError(err.message);
    }
  }

  function regenerateWebhookSecret() {
    setWebhookSecret(newSecret());
    setWebhookMsg('New secret generated — press Save.');
  }

  async function testWebhook() {
    setError('');
    setWebhookMsg('Sending…');
    try {
      const body = JSON.stringify({
        event: 'webhook.test',
        ticket_id: 'test',
        caller_number: '+16195550100',
        urgent: false,
        ended_reason: 'completed',
        created_at: new Date().toISOString(),
        transcripts_complete: true,
        messages: [
          { question: 'Test question', transcript: 'This is a test postcard from Cove.', recording_url: null },
        ],
      });
      const res = await fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Cove-Event': 'webhook.test',
          'X-Cove-Signature': 'sha256=' + (await hmacHex(webhookSecret, body)),
        },
        body,
      });
      setWebhookMsg(res.ok
        ? `Test delivered (${res.status}). Check the receiving app.`
        : `Receiver replied ${res.status} — check the URL.`);
    } catch (err) {
      setWebhookMsg('Could not reach the URL.');
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

      <div className="card section-card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
          Email and push notifications now live on the{' '}
          <button className="btn-text" onClick={() => navigate('/dashboard')} style={{ fontSize: '0.85rem' }}>Dashboard</button>,
          right under your call preview.
        </p>
      </div>

      <div className="card section-card" style={{ marginBottom: '1.25rem' }}>
        <button
          type="button"
          className="btn-text"
          onClick={() => setShowWebhooks(v => !v)}
          aria-expanded={showWebhooks}
          style={{ fontSize: '0.95rem', fontWeight: 600, padding: 0 }}
        >
          Webhooks {showWebhooks ? '▾' : '▸'}
        </button>
        <p className="hint" style={{ marginBottom: showWebhooks ? '1rem' : 0 }}>
          Advanced — post every completed ticket as JSON to your own URL.
        </p>
        {showWebhooks && (
          <>
            <div className="field">
              <label>Webhook URL</label>
              <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://hooks.zapier.com/hooks/catch/…" />
            </div>
            <div className="field">
              <label>Signing secret</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input value={webhookSecret} readOnly placeholder="Generated when you save" style={{ flex: 1 }} />
                <button type="button" className="btn btn-ghost" onClick={regenerateWebhookSecret}>Regenerate</button>
              </div>
              <p className="hint">Signed via the X-Cove-Signature header (HMAC-SHA256 of the body).</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={saveWebhook}>Save</button>
              <button type="button" className="btn btn-ghost" onClick={testWebhook} disabled={!webhookUrl.trim()}>Send test</button>
              {webhookMsg && <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{webhookMsg}</span>}
            </div>
          </>
        )}
      </div>
      <AppFooter />
    </main>
  );
}
