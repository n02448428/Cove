import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <main className="page-narrow" style={{ textAlign: 'center', paddingTop: '8rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          Cove
        </h1>
        <p style={{ color: 'var(--color-text-muted)', marginTop: '1rem', fontSize: '1.1rem', maxWidth: '360px', margin: '1rem auto 0' }}>
          Your AI answers first. Trusted people reach you. Everyone else gets handled.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
        <button className="btn btn-primary" style={{ width: '240px' }} onClick={() => navigate('/auth')}>
          Get Started
        </button>
        <button className="btn btn-ghost" style={{ width: '240px' }} onClick={() => navigate('/auth')}>
          Sign In
        </button>
      </div>

      <div style={{ marginTop: '5rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', textAlign: 'left' }}>
        {[
          { icon: '📞', title: 'AI Screens All Calls', desc: 'Your concierge answers, talks to callers, and decides what matters.' },
          { icon: '🔒', title: 'Trusted List', desc: 'Family and key contacts bypass the AI and ring straight through to you.' },
          { icon: '📩', title: 'Voicemail Log', desc: 'Every message transcribed and saved. Review on your own time.' },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{icon}</div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>{title}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{desc}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
