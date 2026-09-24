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
          Last updated September 24, 2026
        </p>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>What Cove is</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            Cove is an AI-powered call screening service. You forward your calls to a Cove number;
            Cove answers unknown callers, asks your screening questions, records and transcribes
            their answers, and routes calls based on rules you set. Trusted contacts ring through;
            blocked contacts are declined; everyone else is screened.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Trial and billing</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            New accounts receive a 7-day free trial, which requires a payment method on file.
            After the trial, the subscription is $49/month until cancelled. You can cancel anytime
            from the customer portal; cancellation takes effect at the end of the current billing
            period. After cancellation you have a 30-day grace period before your Cove number is
            released. Your Cove number provisions after your payment method is saved and remains
            yours while your subscription is active.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Call forwarding is your responsibility</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            Setting up call forwarding on your phone and with your carrier is done by you, using
            instructions we provide. Forwarding codes, availability, and charges vary by carrier
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
