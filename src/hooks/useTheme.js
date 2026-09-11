import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'cove-theme';

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return { theme: stored, overridden: true };
  } catch (_) { /* ignore */ }
  return { theme: systemTheme(), overridden: false };
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme() {
  const [{ theme, overridden }, setState] = useState(() => {
    if (typeof window === 'undefined') return { theme: 'light', overridden: false };
    const next = readTheme();
    applyTheme(next.theme);
    return next;
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (localStorage.getItem(STORAGE_KEY)) return;
      const next = systemTheme();
      applyTheme(next);
      setState({ theme: next, overridden: false });
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next) => {
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) { /* ignore */ }
    applyTheme(next);
    setState({ theme: next, overridden: true });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, overridden, setTheme, toggleTheme };
}
