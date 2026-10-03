import { formatPhone } from '../lib/format.js';

// "Try it" — call your Cove number and experience exactly what callers hear.
// The honest test: you call Cove, like every real caller does.
export default function TestCallPanel({ coveNumber }) {
  return (
    <div>
      <h3 className="kernel-section-title" style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Try it</h3>
      <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', lineHeight: 1.55, marginBottom: '0.9rem' }}>
        Call your Cove number and hear what your callers hear.
      </p>
      {coveNumber ? (
        <a
          className="btn btn-primary"
          href={`tel:${coveNumber}`}
          style={{ width: '100%', textAlign: 'center', display: 'block', textDecoration: 'none', boxSizing: 'border-box' }}
        >
          Call {formatPhone(coveNumber)}
        </a>
      ) : (
        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Your Cove number is still provisioning…</p>
      )}
    </div>
  );
}
