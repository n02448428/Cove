import { useNavigate } from 'react-router-dom';
import CoveWordmark from '../components/CoveWordmark.jsx';

export default function Terms() {
  const navigate = useNavigate();
  return (
    <div className="landing-shell">
      <header className="landing-header-bar">
        <a href="/" className="cove-wordmark-link" aria-label="Cove home">
          <CoveWordmark markSize={32} />
        </a>
      </header>
      <main className="page-narrow" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <h1 className="page-title">Terms of Service</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
          Last updated November 11, 2026
        </p>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>What Cove is</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            Cove is an AI receptionist for home-service businesses. You answer your phone when
            you can; when you miss a call, conditional call forwarding sends it to Cove. Cove
            answers, asks the caller their name and what they need, takes the best number to
            reach them, and emails you the details so you can call back. Cove does not book
            appointments, connect calls live, or send text messages — it takes the message and
            delivers it to your inbox.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Trial and billing</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            New businesses receive a free 30-day trial — one home-service business per local
            area. After the trial, the service is $2,000 one-time setup plus $500/month until
            cancelled. Founding businesses (the first 3 per trade) have the $2,000 setup waived.
            All payments are final — Cove does not offer refunds. Cancel before your next
            billing date to stop future charges. After cancellation you have a 30-day grace
            period before your Cove number is released.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Call forwarding is your responsibility</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            Setting up conditional forwarding of your missed calls on your phone and with your
            carrier is done by you, using instructions we provide. Forwarding codes, availability, and charges vary by carrier
            and country. Cove numbers are currently US-based; forwarding from non-US numbers may
            incur international charges. We are not responsible for carrier fees, failed
            forwarding setup, or calls that do not reach Cove because forwarding was not active.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Recording consent is your responsibility</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            Cove may record and transcribe calls it answers, and plays a disclosure to callers
            that the call may be recorded. Call-recording laws vary by jurisdiction — some require
            the consent of all parties. You are responsible for ensuring your use of Cove complies
            with the laws where you and your callers are located.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>No guarantees; not for emergencies</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            Cove screens calls but cannot block every unwanted call and cannot guarantee that
            every important call connects. Do not rely on Cove for urgent, time-critical, or
            emergency communications. Cove is not a replacement for emergency services — always
            dial emergency numbers directly from your phone. If you are expecting an urgent call,
            turn call forwarding off.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Acceptable use</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            You agree not to use Cove for unlawful purposes, harassment, fraud, or to screen calls
            on behalf of someone without their knowledge. We may suspend accounts that abuse the
            service.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Limitation of liability</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            Cove is provided &ldquo;as is.&rdquo; To the maximum extent permitted by law, we are
            not liable for missed, delayed, or mishandled calls, carrier charges, or any indirect
            or consequential damages. Our total liability is limited to the amount you paid for
            the service in the 12 months before the claim.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Changes</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            We may update these terms; continued use after changes take effect constitutes
            acceptance.
          </p>
        </section>

        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          ← Back to home
        </button>
      </main>
    </div>
  );
}
