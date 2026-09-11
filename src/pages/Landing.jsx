import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader.jsx';
import CoveWordmark from '../components/CoveWordmark.jsx';

const FEATURES = [
  {
    title: 'Trusted contacts ring through',
    desc: 'Family and key numbers reach you directly.',
  },
  {
    title: 'Unknown callers get a simple check',
    desc: 'Real urgency can connect; the rest doesn’t interrupt you.',
  },
  {
    title: 'A clear call log',
    desc: 'Review messages on your time.',
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <main className="page">
      <AppHeader homeTo="/" />

      <section className="landing-hero page-narrow" style={{ paddingTop: '2rem', maxWidth: 520 }}>
        <p
          className="landing-pain"
          style={{
            color: 'var(--color-text-muted)',
            fontSize: '0.95rem',
            lineHeight: 1.55,
            maxWidth: 420,
            margin: '0 auto 1.75rem',
          }}
        >
          Unknown numbers. Sales pitches. Another interruption while you’re mid-something.
          <br />
          You shouldn’t have to decide whether to answer every time the phone rings.
        </p>

        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <CoveWordmark markSize={56} />
        </div>

        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: '0 0 0.5rem',
            color: 'var(--color-text)',
          }}
        >
          Your cove.
        </h1>
        <p
          style={{
            fontSize: '1.15rem',
            fontWeight: 600,
            lineHeight: 1.45,
            margin: '0 auto',
            maxWidth: 420,
            color: 'var(--color-text)',
          }}
        >
          People you trust get through. Everyone else waits.
        </p>

        <p className="landing-tagline" style={{ maxWidth: 440 }}>
          Cove is your personal space for calls. Trusted contacts ring your phone. Unknown callers get a
          short, simple check. What’s left lands in a log you open when you’re ready.
        </p>

        <p
          style={{
            color: 'var(--color-text-muted)',
            fontSize: '0.95rem',
            lineHeight: 1.55,
            maxWidth: 420,
            margin: '1rem auto 0',
          }}
        >
          Keep the relationships. Cut the noise. One calm place for the rest. Start in a minute.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center', marginTop: '2rem' }}>
          <button className="btn btn-primary" style={{ width: '240px' }} onClick={() => navigate('/auth?mode=signup')}>
            Get your cove
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
      </section>
    </main>
  );
}
