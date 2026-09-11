import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import AppHeader from '../components/AppHeader.jsx';

/**
 * Handles the Supabase password-recovery redirect (URL hash / PASSWORD_RECOVERY).
 * User sets a new password, then continues to onboarding or dashboard.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let settled = false;

    function markRecovery() {
      if (cancelled || settled) return;
      settled = true;
      setHasRecovery(true);
      setError('');
      setReady(true);
    }

    function markMissing() {
      if (cancelled || settled) return;
      settled = true;
      setHasRecovery(false);
      setError('This reset link is invalid or has expired. Request a new one from Sign in.');
      setReady(true);
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY') {
        markRecovery();
        return;
      }
      // Hash tokens may also surface as INITIAL_SESSION / SIGNED_IN with a session.
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
        markRecovery();
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) {
        markRecovery();
        return;
      }
      // Allow the client a beat to parse recovery tokens from the URL hash.
      setTimeout(() => {
        if (cancelled || settled) return;
        supabase.auth.getSession().then(({ data: { session: again } }) => {
          if (cancelled || settled) return;
          if (again) markRecovery();
          else markMissing();
        });
      }, 800);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');

    if (!hasRecovery) {
      setError('This reset link is invalid or has expired. Request a new one from Sign in.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const userId = data.user?.id;
      if (!userId) {
        setInfo('Password updated. Sign in with your new password.');
        navigate('/auth?mode=login');
        return;
      }

      const { data: phoneRow } = await supabase
        .from('phone_numbers')
        .select('provisioning_status')
        .eq('user_id', userId)
        .maybeSingle();

      if (phoneRow?.provisioning_status === 'active') {
        navigate('/dashboard');
      } else {
        navigate('/onboarding');
      }
    } catch (err) {
      setError(err.message || 'Could not update password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-narrow">
      <AppHeader homeTo="/" />
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Choose a new password.</p>
      </div>

      <div className="card">
        {!ready ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>Loading…</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>New password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
                disabled={!hasRecovery}
              />
            </div>
            <div className="field">
              <label>Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
                disabled={!hasRecovery}
              />
            </div>
            {error && <p className="error-msg">{error}</p>}
            {info && (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                {info}
              </p>
            )}
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading || !hasRecovery}
              style={{ width: '100%', marginTop: '1rem' }}
            >
              {loading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        )}

        <p
          style={{
            textAlign: 'center',
            marginTop: '1.5rem',
            fontSize: '0.85rem',
            color: 'var(--color-text-muted)',
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/auth?mode=forgot')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-accent)',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Request a new reset link
          </button>
        </p>
      </div>
    </main>
  );
}
