import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase.js';

import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Onboarding from './pages/Onboarding.jsx';
import ForwardingInstructions from './pages/ForwardingInstructions.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';
import Terms from './pages/Terms.jsx';
import Privacy from './pages/Privacy.jsx';

/**
 * RequireAuth
 * Redirects unauthenticated users to /auth.
 */
function RequireAuth({ children }) {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setChecking(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: '4rem', color: 'var(--color-text-muted)' }}>
        Loading…
      </div>
    );
  }
  return user ? children : <Navigate to="/auth" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />

        {/* Protected */}
        <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
        <Route path="/forwarding" element={<RequireAuth><ForwardingInstructions /></RequireAuth>} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
