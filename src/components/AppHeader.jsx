import { Link } from 'react-router-dom';
import CoveWordmark from './CoveWordmark.jsx';
import ThemeToggle from './ThemeToggle.jsx';

/**
 * Shared brand header for landing + app shell.
 * Pass `actions` for page-specific buttons (Settings, Sign out, etc.).
 * `flush` = full-bleed landing chrome (no bottom gold rule crowding the hero).
 */
export default function AppHeader({ actions = null, homeTo = '/', markSize = 32, flush = false }) {
  return (
    <header className={`app-header${flush ? ' app-header--flush' : ''}`}>
      <Link to={homeTo} className="cove-wordmark-link" aria-label="Cove home">
        <CoveWordmark markSize={markSize} />
      </Link>
      <div className="app-header-actions">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
