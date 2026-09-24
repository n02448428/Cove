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
    desc: 'Strangers explain themselves to Cove first — transcribed, organized, and waiting for the moment you choose.',
  },
];

const STEPS = [
  {
    title: 'Get your Cove number',
    desc: 'Your own still water, provisioned in seconds. It’s yours while you’re subscribed.',
  },
  {
    title: 'Forward your calls',
    desc: 'One tap sends every call into the cove. Ten seconds, undo anytime.',
  },
  {
    title: 'Float in peace',
    desc: 'Storms break outside. Inside, every voice that matters reaches you — and the rest waits quietly.',
  },
];

const PROMISES = [
  {
    title: '7 days free, no risk',
    desc: 'Full access for a week. If your phone doesn’t feel calmer, cancel in one tap.',
  },
  {
    title: 'Cancel anytime',
    desc: 'No contracts, no retention calls, no dark patterns. Leave whenever you want.',
  },
  {
    title: 'Your number stays yours',
    desc: 'While subscribed, your Cove number is yours. Cancel and you get 30 days grace.',
  },
  {
    title: 'Undo in ten seconds',
    desc: 'Forwarding turns off with one tap. Your phone goes back to normal instantly.',
  },
];

const USE_CASES = [
  {
    title: 'For professionals',
    desc: 'Deep work without the pings. Clients with codes reach you; cold callers meet Cove. Review everything at 5pm, not 2pm.',
  },
  {
    title: 'For parents and grandparents',
    desc: 'Scam calls prey on the people you love most. Cove stands between them and the storm — family always rings through.',
  },
  {
    title: 'For small business owners',
    desc: 'Never miss a real customer, never take a spam call mid-job. Every caller explains themselves; you see it all transcribed.',
  },
];

const FAQS = [
  {
    q: 'Do I keep my current phone number?',
    a: 'Yes. Nothing changes about your number. You forward your calls to Cove — callers still dial the number they’ve always dialed.',
  },
  {
    q: 'Will I miss important calls?',
    a: 'Your trusted contacts ring straight through, and anyone with your extension code connects immediately. Everything else is screened, transcribed, and waiting — nothing vanishes.',
  },
  {
    q: 'What about emergencies?',
    a: 'Cove is not for emergencies. Always dial emergency numbers directly from your phone. If you’re expecting an urgent call, turn forwarding off with one tap.',
  },
  {
    q: 'How does the forwarding setup work?',
    a: 'After signup you get a Cove number. Tap one button and your phone dials the forwarding code — ten seconds, no settings menus. It works on AT&T, T-Mobile, and most carriers; Verizon has its own one-tap codes.',
  },
  {
    q: 'Is my call data private?',
    a: 'Your recordings and transcripts are yours. We never sell your data or use call content for advertising. Delete anything, anytime, from your dashboard.',
  },
  {
    q: 'What happens when I cancel?',
    a: 'Forwarding stops, calls ring your phone directly again, and you keep your Cove number for 30 days in case you return. Your data is deleted after the grace period.',
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
              Cove is the breakwater between you and the storm — hard rock outside, calm water within.
            </p>
            <p className="landing-support">
              Scam calls, spammers, and strangers crash against the shell and never reach you.
              The voices you love arrive on still water. Every call is held, transcribed, and
              waiting — nothing demands your attention, everything waits for it.
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

        <section className="landing-features" aria-label="The Cove promise" style={{ marginTop: '3rem' }}>
          <h2 className="price-block__eyebrow" style={{ marginBottom: '1.5rem' }}>The Cove promise</h2>
          {PROMISES.map(({ title, desc }) => (
            <div key={title} className="feature-row">
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </section>

        <section className="landing-features" aria-label="Who Cove is for" style={{ marginTop: '3rem' }}>
          <h2 className="price-block__eyebrow" style={{ marginBottom: '1.5rem' }}>Who it&apos;s for</h2>
          {USE_CASES.map(({ title, desc }) => (
            <div key={title} className="feature-row">
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </section>

        <section className="landing-features" aria-label="Questions" style={{ marginTop: '3rem' }}>
          <h2 className="price-block__eyebrow" style={{ marginBottom: '1.5rem' }}>Questions</h2>
          {FAQS.map(({ q, a }) => (
            <details key={q} className="feature-row">
              <summary>{q}</summary>
              <p style={{ marginTop: '0.5rem' }}>{a}</p>
            </details>
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

        <section className="landing-features" aria-label="Begin" style={{ marginTop: '3rem', textAlign: 'center' }}>
          <h2 className="landing-headline" style={{ fontSize: '2rem' }}>The storm can wait.</h2>
          <p className="landing-support" style={{ maxWidth: '30rem', margin: '1rem auto 1.5rem' }}>
            Seven free days. Ten-second setup. Your phone, finally quiet —
            except for the voices that matter.
          </p>
          <div className="landing-ctas" style={{ justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/auth?mode=signup')}
            >
              Start my 7 free days
            </button>
          </div>
        </section>
      </div>

      <footer className="cove-footer">
        <CoveWordmark markSize={28} />
        <p className="cove-footer-tag">Protected by rock. Held by water.</p>
        <p className="cove-footer-legal">
          Calls answered by Cove may be recorded and transcribed. Call-forwarding availability,
          codes, and charges vary by carrier — Cove numbers are currently US-based. Cove screens
          calls but can&apos;t block every unwanted call; it&apos;s not a replacement for emergency services.
        </p>
        <p className="cove-footer-links">
          <a href="/terms">Terms</a>
          {' · '}
          <a href="/privacy">Privacy</a>
        </p>
      </footer>
    </div>
  );
}
