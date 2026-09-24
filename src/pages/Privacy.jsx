import { useNavigate } from 'react-router-dom';
import CoveWordmark from '../components/CoveWordmark.jsx';

export default function Privacy() {
  const navigate = useNavigate();
  return (
    <div className="landing-shell">
      <header className="landing-header-bar">
        <a href="/" className="cove-wordmark-link" aria-label="Cove home">
          <CoveWordmark markSize={32} />
        </a>
      </header>
      <main className="page-narrow" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        <h1 className="page-title">Privacy Policy</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
          Last updated September 24, 2026
        </p>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>What we collect</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            To provide the service, we collect: your account information (email, name), your Cove
            and forwarding phone numbers, your screening rules and contact lists, and the content
            of screened calls — including audio recordings, transcripts, and call metadata
            (caller number, time, duration). We also collect payment information through our
            payment processor; we never see or store your full card number.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>How we use it</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            Your data is used solely to operate Cove: answering and screening your calls,
            showing you transcripts and call history, and billing your subscription. We do not
            sell your personal information or your callers&rsquo; information to anyone, and we
            do not use call content for advertising.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Who handles your data</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            We rely on a small set of processors to run the service: Twilio (phone calls and
            recordings), Stripe (payments), and Supabase (secure data hosting). Each processes
            data only as needed to provide their service to us.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Retention and deletion</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            Call recordings and transcripts are kept while your account is active so you can
            review your history. You can delete individual call records from your dashboard. If
            you cancel your account, your data is deleted after the 30-day number grace period,
            except where we are required to retain records by law.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Your rights</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            You can access, correct, or delete your personal information at any time from your
            dashboard or by contacting us. If you are in a jurisdiction with additional privacy
            rights (such as the EU or California), we honor applicable access, deletion, and
            opt-out requests.
          </p>
        </section>

        <section style={{ marginBottom: '1.75rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Security</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            We use industry-standard measures to protect your data, including encrypted
            connections and access controls. No system is perfectly secure, and we cannot
            guarantee absolute security.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Changes</h3>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--color-text-muted)' }}>
            We may update this policy; material changes will be communicated through the service
            or by email.
          </p>
        </section>

        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          ← Back to home
        </button>
      </main>
    </div>
  );
}
