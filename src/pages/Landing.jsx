import { useNavigate } from 'react-router-dom';
import CoveMark from '../components/CoveMark.jsx';
import CoveWordmark from '../components/CoveWordmark.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import WaveDivider from '../components/WaveDivider.jsx';

const STEPS = [
  {
    title: 'Your own Cove number',
    desc: 'Set up for your business, live within 24 hours.',
  },
  {
    title: 'Forward your missed calls',
    desc: 'Dial one code on your phone. Undo anytime.',
  },
  {
    title: 'Never miss a job',
    desc: 'Cove screens, asks, and sends you every detail.',
  },
];

const MOMENTS = [
  {
    title: 'Mid-job, phone ringing in your pocket.',
    desc: 'You don\u2019t stop. Cove screens it and sends you the details \u2014 you call back when you\u2019re free.',
  },
  {
    title: 'Your hands are busy. Your next client is calling.',
    desc: 'They\u2019re greeted, asked your questions, and the summary lands in your inbox.',
  },
  {
    title: 'A patient calls after hours.',
    desc: 'Screened and summarized. Waiting in your inbox in the morning.',
  },
  {
    title: 'A big lead calls while you\u2019re driving.',
    desc: 'Greeted like they matter. Asked your questions, summarized, waiting when you park.',
  },
  {
    title: 'You\u2019re at dinner. Unknown number.',
    desc: 'Cove screens it. You stay at the table \u2014 the summary\u2019s in your inbox.',
  },
  {
    title: 'A customer calls on a Sunday.',
    desc: 'Cove screens it \u2014 nights and weekends included. The job\u2019s still yours on Monday.',
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
            <h1 className="landing-headline">Never miss another job.</h1>
            <p className="landing-subhead">
              Cove screens the calls you can&apos;t take, asks your questions, and sends you a summary.
            </p>

            <div className="landing-ctas">
              <a className="btn btn-primary" href="tel:+16193402683">Call the live demo</a>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => navigate('/auth?mode=login')}
              >
                Sign In
              </button>
            </div>
            <p className="landing-support" style={{ marginTop: '1.5rem' }}>
              Every missed call screened. Every lead captured.
            </p>
          </div>
        </section>

        <section className="landing-features" aria-label="Sound familiar?" style={{ marginTop: '3rem' }}>
          <h2 className="price-block__eyebrow" style={{ marginBottom: '1rem' }}>Sound familiar?</h2>
          <p className="landing-quote">A missed call is a job that went to someone else.</p>
          {MOMENTS.map(({ title, desc }) => (
            <div key={title} className="feature-row">
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </section>

        <section className="landing-features" aria-label="How it works" style={{ marginTop: '3rem' }}>
          <h2 className="price-block__eyebrow" style={{ marginBottom: '1rem' }}>How it works</h2>
          <p className="landing-quote">You answer when you can. Cove covers the rest.</p>
          {STEPS.map(({ title, desc }, i) => (
            <div key={title} className="feature-row">
              <h3><span style={{ color: 'var(--color-text-muted)', fontWeight: 500, marginRight: '0.5rem' }}>{i + 1}.</span>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </section>

        <WaveDivider />

        <section className="price-block" aria-label="Pricing">
          <p className="price-block__eyebrow">Work with Visionary Minds Solutions</p>
          <p className="landing-quote landing-quote--center">Every missed call screened. Every lead captured.</p>
          <h2 className="price-block__primary">$500/mo. $2,000 white-glove setup.</h2>
          <p className="price-block__fine">
            Done-for-you by Visionary Minds Solutions. Custom questions for your business, live within 24 hours. 30-day money-back guarantee on setup. No per-call charges.
          </p>
          <div className="landing-ctas" style={{ marginTop: '1.25rem', marginBottom: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a className="btn btn-primary" href="tel:+16193402683">Call the live demo</a>
            <a className="btn btn-ghost" href="mailto:dmitry@visionaryminds.solutions?subject=Cove%20white-glove%20setup">Email Dmitry</a>
            <a className="btn btn-ghost" href="https://visionaryminds.solutions" target="_blank" rel="noopener noreferrer">Visit VisionaryMinds</a>
          </div>
        </section>

        <section className="landing-features" aria-label="Live demo" style={{ marginTop: '3rem', textAlign: 'center' }}>
          <h2 className="price-block__eyebrow" style={{ marginBottom: '1rem' }}>Hear it working</h2>
          <p className="landing-quote landing-quote--center">This number rings a working Cove demo line — hear what your callers would hear.</p>
          <p style={{ fontSize: '2rem', margin: '1.5rem 0' }}>
            <a href="tel:+16193402683" style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>(619) 340-2683</a>
          </p>
          <p className="price-block__fine">Call it right now. Every call opens by saying it&rsquo;s an AI receptionist and that the call may be recorded.</p>
        </section>

        <section className="landing-features" aria-label="Begin" style={{ marginTop: '3rem', textAlign: 'center' }}>
          <h2 className="landing-headline" style={{ fontSize: '2rem' }}>Never miss another job.</h2>
          <p className="landing-quote landing-quote--center">Every missed call screened. Every lead in your inbox.</p>
          <div className="landing-ctas" style={{ justifyContent: 'center', marginTop: '1.5rem' }}>
            <a className="btn btn-primary" href="tel:+16193402683">Call the live demo</a>
          </div>
        </section>
      </div>

      <footer className="cove-footer">
        <CoveWordmark markSize={28} />
        <p className="cove-footer-tag">Never miss another job.</p>
        <p className="cove-footer-links">
          <a href="/terms">Terms</a>
          {' · '}
          <a href="/privacy">Privacy</a>
        </p>
      </footer>
    </div>
  );
}

