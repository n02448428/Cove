import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import AppHeader from '../components/AppHeader.jsx';
import CoveMark from '../components/CoveMark.jsx';

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  const [mode, setMode] = useState(
    modeParam === 'signup' ? 'signup' : modeParam === 'forgot' ? 'forgot' : 'login'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  // MFA step: after password sign-in, users with 2FA enrolled must enter a code.
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState(null);

  useEffect(() => {
    const next =
      modeParam === 'signup' ? 'signup' : modeParam === 'forgot' ? 'forgot' : 'login';
    setMode(next);
  }, [modeParam]);

  useEffect(() => {
    if (!loading) return undefined;
    const t = setTimeout(() => {
      setError((prev) => prev || 'This is taking longer than expected. Check your connection and try again.');
    }, 15000);
    return () => clearTimeout(t);
  }, [loading]);

  function switchMode(next) {
    setMode(next);
    setError('');
    setInfo('');
    setPassword('');
    setMfaRequired(false);
    setMfaCode('');
    setMfaFactorId(null);
    setSearchParams(
      next === 'signup'
        ? { mode: 'signup' }
        : next === 'forgot'
          ? { mode: 'forgot' }
          : { mode: 'login' }
    );
  }

  async function handleForgotSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setInfo(
        'If an account exists for that email, a reset link is on the way. Check your inbox and spam folder. Delivery depends on project email (SMTP/Resend) being configured.'
      );
    } catch (err) {
      setError(err.message || 'Could not send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Email confirmation may leave no session — don't navigate blindly.
        if (!data.session) {
          setInfo('Check your email to confirm your account before signing in.');
          return;
        }
        // Profile row is created by the auth.users trigger; complete setup next.
        navigate('/onboarding');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // 2FA (opt-in): password gets you to aal1; a verified TOTP factor
        // requires a second step before the session is fully trusted.
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
          const { data: factors } = await supabase.auth.mfa.listFactors();
          const verified = (factors?.totp || []).find(f => f.status === 'verified');
          if (verified) {
            setMfaFactorId(verified.id);
            setMfaRequired(true);
            setLoading(false);
            return;
          }
        }
        await afterSignIn(data.user.id);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function afterSignIn(userId) {
    // provisioning_status lives on phone_numbers, not profiles
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
  }

  async function handleMfaSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (chErr) throw chErr;
      const { data, error } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challenge.id,
        code: mfaCode.trim(),
      });
      if (error) throw error;
      setMfaRequired(false);
      setMfaCode('');
      await afterSignIn(data.user.id);
    } catch (err) {
      setError(err.message || 'That code didn’t work. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const isForgot = mode === 'forgot';

  return (
    <main className="page-narrow">
      <AppHeader homeTo="/" />
      <div className="auth-lede">
        <div style={{ marginBottom: '0.75rem' }}>
          <CoveMark size={36} />
        </div>
        <h1 className="page-title" style={{ marginBottom: '0.35rem' }}>
          {mode === 'login' ? 'Welcome back.' : mode === 'signup' ? 'Create your account.' : 'Reset your password.'}
        </h1>
        <p style={{ margin: 0 }}>
          {mode === 'signup'
            ? 'Seven days of quiet starts after checkout — card on file for the trial.'
            : mode === 'forgot'
              ? 'We’ll email a reset link if an account exists.'
              : 'Sign in to your cove.'}
        </p>
      </div>

      <div className="card">
        {isForgot ? (
          <form onSubmit={handleForgotSubmit}>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
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
              disabled={loading}
              style={{ width: '100%', marginTop: '1rem' }}
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        ) : mfaRequired ? (
          <form onSubmit={handleMfaSubmit}>
            <div className="field">
              <label>Two-factor code</label>
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="6-digit code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              <p className="hint">From your authenticator app.</p>
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: '100%', marginTop: '1rem' }}
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <p style={{ textAlign: 'center', marginTop: '0.75rem' }}>
              <button
                type="button"
                onClick={() => { setMfaRequired(false); setMfaCode(''); setError(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
              >
                Back to sign in
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
            {mode === 'login' && (
              <p style={{ textAlign: 'right', marginTop: '0.25rem', marginBottom: 0 }}>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-accent)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    padding: 0,
                  }}
                >
                  Forgot password?
                </button>
              </p>
            )}
            {error && <p className="error-msg">{error}</p>}
            {info && (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                {info}
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
        )}

        <p
          style={{
            textAlign: 'center',
            marginTop: '1.5rem',
            fontSize: '0.85rem',
            color: 'var(--color-text-muted)',
          }}
        >
          {isForgot ? (
            <>
              Remembered your password?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-accent)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-accent)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
