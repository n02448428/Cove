import CoveWordmark from './CoveWordmark.jsx';

/**
 * Shared footer for authenticated pages: brand presence + legal links.
 * Logged-in users can't reach the landing page, so Terms/Privacy live here.
 */
export default function AppFooter() {
  return (
    <footer className="cove-footer" style={{ marginTop: '4rem' }}>
      <CoveWordmark markSize={24} />
      <p className="cove-footer-tag">Protected by rock. Held by water.</p>
      <p className="cove-footer-links">
        <a href="/terms">Terms</a>
        {' · '}
        <a href="/privacy">Privacy</a>
      </p>
    </footer>
  );
}
