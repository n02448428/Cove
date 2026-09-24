import { useNavigate } from 'react-router-dom';
import CoveMark from '../components/CoveMark.jsx';
import CoveWordmark from '../components/CoveWordmark.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

const FEATURES = [
  {
    title: 'Your mom gets through. The extended-warranty guy doesn\u2019t.',
    desc: 'People you trust ring your phone directly. Everyone else meets Cove first.',
  },
  {
    title: 'Every stranger explains themselves before your phone rings.',
    desc: 'Unknown callers answer your questions. Urgent ones can connect \u2014 the rest wait quietly.',
  },
  {
    title: 'No more voicemail roulette.',
    desc: 'Every call transcribed and organized. Open it when you\u2019re ready, not when they demand it.',
  },
];

const STEPS = [
  {
    title: 'Get your Cove number',
    desc: 'A real phone number, provisioned in seconds. It\u2019s yours while you\u2019re subscribed.',
  },
  {
    title: 'Forward your calls',
    desc: 'One tap sends every call to Cove. Takes ten seconds, undo anytime.',
  },
  {
    title: 'Live in peace',
    desc: 'Your phone rings for people who matter. Everything else lands in your log, transcribed.',
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <div className="landing-wash" aria-hidden="true">
        <img
          className="landing-wash__img"
          src="/cove-wash.jpg"
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
        <section className="landing-hero">
          <CoveMark size={220} className="cove-hero-mark" />
          <div className="landing-copy">
            <h1 className="landing-headline">Your phone rings only for people who matter.</h1>
            <p className="landing-subhead">
              Cove answers the rest \u2014 asks who they are, writes it down, and lets you decide.
            </p>
            <p className="landing-support">
              Spam, sales pitches, and unknown numbers never interrupt you again. Trusted contacts
              ring straight through. Everyone else explains themselves to Cove first, and every call
              lands in your log, transcribed, waiting on your time.
            </p>

            <div className="landing-ctas">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/auth?mode=signup')}
              >
                Get your cove
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate('/auth?mode=login')}
              >
                Sign In
              </button>
            </div>
          </div>
        </section>

        <section className="landing-features" aria-label="What Cove does">
          {FEATURES.map(({ title, desc }) => (
            <div key={title} className="feature-row">
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </section>

        <section className="landing-features" aria-label="How it works" style={{ marginTop: '3rem' }}>
          <h2 className="price-block__eyebrow" style={{ marginBottom: '1.5rem' }}>How it works</h2>
          {STEPS.map(({ title, desc }, i) => (
            <div key={title} className="feature-row">
              <h3><span style={{ color: 'var(--color-text-muted)', fontWeight: 500, marginRight: '0.5rem' }}>{i + 1}.</span>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </section>

        <section className="price-block" aria-label="Pricing">
          <p className="price-block__eyebrow">Membership</p>
          <h2 className="price-block__primary">Try Cove free for 7 days. $49/mo after — cancel anytime.</h2>
          <p className="price-block__support">
            Card on file for the trial · your Cove number provisions after payment method is saved ·
            number stays yours while subscribed · 30-day grace if you cancel.
          </p>
          <p className="price-block__plan">7-day trial → $49/mo</p>
          <p className="price-block__fine">
            Card required. Cancel anytime in trial. Number after payment method saved. Sticky while
            subscribed; 30-day grace after cancel. Cancel or update your card anytime in the
            Customer Portal.
          </p>
          <div className="landing-ctas" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/auth?mode=signup')}
            >
              Get your cove
            </button>
          </div>
        </section>
      </div>

      <footer className="cove-footer">
        <CoveWordmark markSize={28} />
        <p className="cove-footer-tag">Your calls, organized. Your peace, protected.</p>
      </footer>
    </div>
  );
}
