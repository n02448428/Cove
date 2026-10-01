import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import CoveMark from '../components/CoveMark.jsx';
import CoveWordmark from '../components/CoveWordmark.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import WaveDivider from '../components/WaveDivider.jsx';

const STEPS = [
  {
    title: 'Get your Cove number',
    desc: 'Yours in seconds.',
  },
  {
    title: 'Forward your calls',
    desc: 'One tap. Undo anytime.',
  },
  {
    title: 'Breathe',
    desc: 'Cove handles the rest.',
  },
];

const MOMENTS = [
  {
    title: 'Mid-job, phone ringing in your pocket.',
    desc: 'You don\u2019t stop. Cove answers, screens, and holds it for 5pm.',
  },
  {
    title: 'Your hands are busy. Your next client is calling.',
    desc: 'They\u2019re greeted warmly \u2014 and you catch up when you\u2019re free.',
  },
  {
    title: 'A patient calls after hours.',
    desc: 'Answered kindly. Transcribed. Waiting in the morning.',
  },
  {
    title: 'A big lead calls while you\u2019re driving.',
    desc: 'Greeted like they matter. Qualified, transcribed, waiting when you park.',
  },
  {
    title: 'You\u2019re at dinner. Unknown number.',
    desc: 'Cove takes it. You stay at the table.',
  },
  {
    title: 'Your mom gets a call from \u201cher bank.\u201d',
    desc: 'Cove stands between her and the storm. You see every word.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  // Remembered sign-in: if a session exists, CTAs open the cove instead of
  // asking the user to sign up again.
  const [sessionUser, setSessionUser] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUser(session?.user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function goPrimary() {
    if (!sessionUser) {
      navigate('/auth?mode=signup');
      return;
    }
    const { data: phoneRow } = await supabase
      .from('phone_numbers')
      .select('provisioning_status')
      .eq('user_id', sessionUser.id)
      .maybeSingle();
    navigate(phoneRow?.provisioning_status === 'active' ? '/dashboard' : '/onboarding');
  }
  const primaryLabel = sessionUser ? 'Open your cove' : null;

  return (
    <div className="landing">
      <div className="landing-wash" aria-hidden="true">
        <img
          className="landing-wash__img"
          src="/cove-hero.webp"
          alt=""
          width={1600}
          height={1067}
        />
        <div className="landing-wash__veil" />
      </div>

      <header className="landing-header-bar">
        <a href="/" className="cove-wordmark-link" aria-label="Cove home">
          <CoveWordmark markSize={32} />
        </a>
        <div className="app-header-actions">
          <button
            type="button"
            className="header-link"
            onClick={() => navigate('/auth?mode=login')}
          >
            Sign In
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="landing-shell">
        <figure
          aria-hidden="true"
          style={{
            width: '100vw',
            marginLeft: 'calc(50% - 50vw)',
            marginBottom: 'var(--space-8)',
            maxHeight: '42vh',
            overflow: 'hidden',
            WebkitMaskImage: 'linear-gradient(180deg, #000 55%, transparent 100%)',
            maskImage: 'linear-gradient(180deg, #000 55%, transparent 100%)',
          }}
        >
          <img
            src="/cove-calm-waters.webp"
            alt=""
            style={{ display: 'block', width: '100%', height: '100%', maxHeight: '42vh', objectFit: 'cover' }}
          />
        </figure>
        <section className="landing-hero">
          <CoveMark size={220} className="cove-hero-mark" />
          <div className="landing-copy">
            <h1 className="landing-headline">The storm can wait.</h1>
            <p className="landing-subhead">
              Cove answers the calls you don&apos;t want, and lets through the voices you love.
            </p>

            <div className="landing-ctas">
              <button
                type="button"
                className="btn btn-primary"
                onClick={goPrimary}
              >
                {primaryLabel || 'Start my 7 free days'}
              </button>
              {!sessionUser && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => navigate('/auth?mode=login')}
                >
                  Sign In
                </button>
              )}
            </div>
            <p className="landing-support" style={{ marginTop: '1.5rem' }}>
              Your pocket stays quiet. Your heart stays full.
            </p>
          </div>
        </section>

        <section className="landing-features" aria-label="Sound familiar?" style={{ marginTop: '3rem' }}>
          <h2 className="price-block__eyebrow" style={{ marginBottom: '1rem' }}>Sound familiar?</h2>
          <p className="landing-quote">Remember when a ringing phone meant someone that mattered? It&rsquo;s like that again.</p>
          {MOMENTS.map(({ title, desc }) => (
            <div key={title} className="feature-row">
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </section>

        <section className="landing-features" aria-label="How it works" style={{ marginTop: '3rem' }}>
          <h2 className="price-block__eyebrow" style={{ marginBottom: '1rem' }}>How it works</h2>
          <p className="landing-quote">Breathe easier. Your phone&rsquo;s got the noise; you&rsquo;ve got the people.</p>
          {STEPS.map(({ title, desc }, i) => (
            <div key={title} className="feature-row">
              <h3><span style={{ color: 'var(--color-text-muted)', fontWeight: 500, marginRight: '0.5rem' }}>{i + 1}.</span>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </section>

        <WaveDivider />

        <section className="price-block" aria-label="Pricing">
          <p className="price-block__eyebrow">Membership</p>
          <p className="landing-quote landing-quote--center">Calm isn&rsquo;t the absence of calls. It&rsquo;s the absence of the wrong ones.</p>
          <h2 className="price-block__primary">7 days free. Then $49/mo. Cancel anytime.</h2>
          <p className="price-block__fine">
            Card required for the trial. All payments are final — cancel before your next billing date to stop future charges.
          </p>
          <div className="landing-ctas" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={goPrimary}
            >
              {primaryLabel || 'Start my 7 free days'}
            </button>
          </div>
        </section>

        <section className="landing-features" aria-label="Begin" style={{ marginTop: '3rem', textAlign: 'center' }}>
          <h2 className="landing-headline" style={{ fontSize: '2rem' }}>Your phone, finally quiet.</h2>
          <p className="landing-quote landing-quote--center">Your life, uninterrupted &mdash; except by the people you&rsquo;d interrupt anything for.</p>
          <div className="landing-ctas" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={goPrimary}
            >
              {primaryLabel || 'Start my 7 free days'}
            </button>
          </div>
        </section>
      </div>

      <footer className="cove-footer">
        <CoveWordmark markSize={28} />
        <p className="cove-footer-tag">Protected by rock. Held by water.</p>
        <p className="cove-footer-links">
          <a href="/terms">Terms</a>
          {' · '}
          <a href="/privacy">Privacy</a>
        </p>
      </footer>
    </div>
  );
}
