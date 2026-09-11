import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader.jsx';

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

      <AppHeader
        homeTo="/"
        flush
        actions={
          <button
            type="button"
            className="header-link"
            onClick={() => navigate('/auth?mode=login')}
          >
            Sign In
          </button>
        }
      />

      <div className="landing-shell">
        <section className="landing-hero">
          <div className="landing-copy">
            <p className="landing-pain">
              Unknown numbers. Sales pitches. Another interruption while you’re mid-something.
              <br />
              You shouldn’t have to decide whether to answer every time the phone rings.
            </p>

            <h1 className="landing-headline">Your cove.</h1>
            <p className="landing-subhead">
              People you trust get through. Everyone else waits.
            </p>
            <p className="landing-support">
              Cove is your personal space for calls. Trusted contacts ring your phone. Unknown
              callers get a short, simple check. What’s left lands in a log you open when you’re
              ready.
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
    </div>
  );
}
