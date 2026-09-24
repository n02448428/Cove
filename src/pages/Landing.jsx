import { useNavigate } from 'react-router-dom';
import CoveMark from '../components/CoveMark.jsx';
import CoveWordmark from '../components/CoveWordmark.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

const FEATURES = [
  {
    title: 'Hard shell. Nothing gets through uninvited.',
    desc: 'Scammers and spammers break against the rock. Your phone stays silent.',
  },
  {
    title: 'Calm water. The important ones reach you gently.',
    desc: 'Family and trusted voices ring straight through to still water.',
  },
  {
    title: 'Every call held, nothing lost.',
    desc: 'Strangers explain themselves to Cove first \u2014 transcribed, organized, and waiting for the moment you choose.',
  },
];

const STEPS = [
  {
    title: 'Get your Cove number',
    desc: 'Your own still water, provisioned in seconds. It\u2019s yours while you\u2019re subscribed.',
  },
  {
    title: 'Forward your calls',
    desc: 'One tap sends every call into the cove. Ten seconds, undo anytime.',
  },
  {
    title: 'Float in peace',
    desc: 'Storms break outside. Inside, every voice that matters reaches you \u2014 and the rest waits quietly.',
  },
];

export default function Landing() {
  const navigate = useNavigate();

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
        <section className="landing-hero">
          <CoveMark size={220} className="cove-hero-mark" />
          <div className="landing-copy">
            <h1 className="landing-headline">Your phone rings only for people who matter.</h1>
            <p className="landing-subhead">
              Cove is the breakwater between you and the storm \u2014 hard rock outside, calm water within.
            </p>
            <p className="landing-support">
              Scam calls, spammers, and strangers crash against the shell and never reach you.
              The voices you love arrive on still water. Every call is held, transcribed, and
              waiting \u2014 nothing demands your attention, everything waits for it.
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
        <p className="cove-footer-tag">Protected by rock. Held by water.</p>
        <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '1rem', lineHeight: 1.7, maxWidth: '32rem', marginLeft: 'auto', marginRight: 'auto' }}>
          Calls answered by Cove may be recorded and transcribed. Call-forwarding availability,
          codes, and charges vary by carrier — Cove numbers are currently US-based. Cove screens
          calls but can&apos;t block every unwanted call; it&apos;s not a replacement for emergency services.
        </p>
      </footer>
    </div>
  );
}
