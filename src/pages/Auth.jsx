import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import AppHeader from '../components/AppHeader.jsx';

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  const mode = modeParam === 'signup' ? 'signup' : 'login';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Keep URL in sync when toggling mode
  function setMode(next) {
    setError('');
    setMessage('');
    setSearchParams(next === 'signup' ? { mode: 'signup' } : { mode: 'login' });
  }

  // Normalize missing/invalid mode to login in the URL
  useEffect(() => {
    if (modeParam !== 'signup' && modeParam !== 'login') {
      setSearchParams({ mode: 'login' }, { replace: true });
    }
  }, [modeParam, setSearchParams]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Profile row is created by the auth.users trigger; complete setup next.
        // Often no session until email confirm — don't bounce to RequireAuth.
        if (!data.session) {
          setMessage('Check your email to confirm, then sign in.');
          return;
        }
        navigate('/onboarding');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // provisioning_status lives on phone_numbers, not profiles
        const { data: phoneRow } = await supabase
          .from('phone_numbers')
          .select('provisioning_status')
          .eq('user_id', data.user.id)
          .maybeSingle();
        if (phoneRow?.provisioning_status === 'active') {
          navigate('/dashboard');
        } else {
          navigate('/onboarding');
        }
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-narrow">
      <AppHeader homeTo="/" />
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>
          {mode === 'login' ? 'Welcome back.' : 'Create your account.'}
        </p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="error-msg">{error}</p>}
          {message && (
            <p style={{ color: 'var(--cove-teal)', fontSize: '0.9rem', marginTop: '0.75rem' }}>
              {message}
            </p>
          )}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </main>
  );
}
