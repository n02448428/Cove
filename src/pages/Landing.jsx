import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader.jsx';
import CoveWordmark from '../components/CoveWordmark.jsx';

const FEATURES = [
  {
    title: 'Trusted contacts ring through',
    desc: 'Family and key numbers bypass screening and reach your phone directly.',
  },
  {
    title: 'DTMF call screening',
    desc: 'Unknown callers get a short keypad prompt. Urgent paths connect; the rest stay out of your way.',
  },
  {
    title: 'Voicemail log',
    desc: 'Voicemails are saved to your log so you can review them on your own time.',
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <main className="page">
      <AppHeader homeTo="/" />

      <section className="landing-hero page-narrow" style={{ paddingTop: '2rem', maxWidth: 520 }}>
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <CoveWordmark markSize={56} />
        </div>
        <p className="landing-tagline">
          Trusted contacts ring through. Everyone else is screened with DTMF. Voicemail stays in one calm log.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center', marginTop: '2rem' }}>
          <button className="btn btn-primary" style={{ width: '240px' }} onClick={() => navigate('/auth?mode=signup')}>
            Get Started
          </button>
          <button className="btn btn-ghost" style={{ width: '240px' }} onClick={() => navigate('/auth?mode=login')}>
            Sign In
          </button>
        </div>

        <div className="landing-features">
          {FEATURES.map(({ title, desc }) => (
            <div key={title} className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--cove-teal)' }}>
                {title}
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{desc}</p>
            </div>
          ))}
        </div>

        <p className="landing-note">
          Cove (withcove.co) is a personal call filter — not an AI receptionist product.
          Unrelated to coveai.dev.
        </p>
      </section>
    </main>
  );
}