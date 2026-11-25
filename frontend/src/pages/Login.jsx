
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Loader2, LogIn, Scale, Chrome } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAuthErrorMessage } from '../utils/authErrors';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const { login, loginWithGoogle, currentUser, sessionMessage } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
    } catch (err) {
      console.error('Login error:', err.code || err.name);
      setError(getAuthErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsGoogleSubmitting(true);

    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('Google login error:', err.code || err.name);

      setError(getAuthErrorMessage(err));
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const isSigningIn = isSubmitting || isGoogleSubmitting;

  // Redirect only when the server session, profile and role are ready.
  if (currentUser) return <Navigate to="/" replace />;

  return (
    <div className="auth-page">
      <section className="auth-card animate-fade-in">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <Scale size={30} />
          </div>

          <div className="auth-brand-copy">
            <h1 className="auth-title">Law Clinic</h1>
            <p className="auth-subtitle">
              Sign in to your clinic workspace.
            </p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="auth-form">
          <label className="auth-field">
            <span className="auth-label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email address"
              autoComplete="email"
              className="auth-input"
              required
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              className="auth-input"
              required
            />
          </label>

          {(error || sessionMessage) && (
            <p className="auth-message auth-message-error" role="alert">
              {error || sessionMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSigningIn}
            className="auth-submit-button"
          >
            {isSubmitting ? (
              <Loader2 size={18} className="student-loader-icon" />
            ) : (
              <LogIn size={18} />
            )}
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">
          <span>OR</span>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isSigningIn}
          className="auth-google-button"
        >
          {isGoogleSubmitting ? (
            <Loader2 size={18} className="student-loader-icon" />
          ) : (
            <Chrome size={18} />
          )}
          {isGoogleSubmitting
            ? 'Connecting to Google...'
            : 'Continue with Google'}
        </button>

        <p className="auth-footer-copy">
          Do not have an account?{' '}
          <Link to="/register" className="auth-footer-link">
            Register
          </Link>
        </p>
      </section>
    </div>
  );
}
