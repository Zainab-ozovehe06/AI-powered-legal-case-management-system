
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, LogIn, Scale, Chrome } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
      navigate('/');
    } catch (err) {
      console.error('Login error:', err);
      setError('Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsGoogleSubmitting(true);

    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err) {
      console.error('Google login error:', err);

      switch (err.code) {
        case 'auth/popup-closed-by-user':
          setError('Sign-in was cancelled. Please try again.');
          break;
        case 'auth/popup-blocked':
          setError('Your browser blocked the sign-in popup. Allow popups and try again.');
          break;
        case 'auth/unauthorized-domain':
          setError('This website is not authorized for Google sign-in. Check Firebase Authorized domains.');
          break;
        case 'auth/account-exists-with-different-credential':
          setError('An account already exists with this email. Try signing in with your existing method.');
          break;
        default:
          setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const isSigningIn = isSubmitting || isGoogleSubmitting;

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

          {error && (
            <p className="auth-message auth-message-error" role="alert">
              {error}
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
