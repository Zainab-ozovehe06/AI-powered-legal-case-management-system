import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, LogIn, Scale } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
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

  return (
    <div className="auth-page">
      <section className="auth-card animate-fade-in">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <Scale size={30} />
          </div>
          <div className="auth-brand-copy">
            <h1 className="auth-title">Law Clinic</h1>
            <p className="auth-subtitle">Sign in to your clinic workspace.</p>
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

          {error ? <p className="auth-message auth-message-error">{error}</p> : null}

          <button type="submit" disabled={isSubmitting} className="auth-submit-button">
            {isSubmitting ? (
              <Loader2 size={18} className="student-loader-icon" />
            ) : (
              <LogIn size={18} />
            )}
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

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
