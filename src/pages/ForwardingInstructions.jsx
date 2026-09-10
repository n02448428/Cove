import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function ForwardingInstructions() {
  const navigate = useNavigate();
  const [conciergeNumber, setConciergeNumber] = useState('');
  const [provisioningStatus, setProvisioningStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNumber() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Live schema: phone_numbers.twilio_number (not user_profiles.concierge_number)
      const { data } = await supabase
        .from('phone_numbers')
        .select('twilio_number, provisioning_status')
        .eq('user_id', user.id)
        .maybeSingle();
      setProvisioningStatus(data?.provisioning_status || 'pending');
      setConciergeNumber(data?.twilio_number || '');
      setLoading(false);
    }
    fetchNumber();
  }, []);

  function copyNumber() {
    if (conciergeNumber) navigator.clipboard.writeText(conciergeNumber);
  }

  const displayNumber = loading
    ? 'Loading...'
    : conciergeNumber || (provisioningStatus === 'failed'
      ? 'Provisioning failed — contact support'
      : 'Number provisioning pending…');

  return (
    <main className="page-narrow">
      <h2 style={{ fontWeight: 800, fontSize: '1.5rem', marginBottom: '0.5rem' }}>Forward your number</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>
        Forward all calls to your Cove number. Carrier steps vary — undo anytime in your phone settings.
      </p>

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
          <li>Select "Always forward"</li>
          <li>Enter your Cove number above</li>
        </ol>
      </div>

      <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/dashboard')}>
        I've set it up → Go to Dashboard
      </button>
    </main>
  );
}
