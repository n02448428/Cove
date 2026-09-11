import { Link } from 'react-router-dom';
import CoveWordmark from './CoveWordmark.jsx';
import ThemeToggle from './ThemeToggle.jsx';

/**
 * Shared brand header for landing + app shell.
 * Pass `actions` for page-specific buttons (Settings, Sign out, etc.).
 */
export default function AppHeader({ actions = null, homeTo = '/', markSize = 32 }) {
  return (
    <header className="app-header">
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
