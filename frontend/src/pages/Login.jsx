import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Scale, LogIn } from 'lucide-react';

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
      await login(email, password);
      navigate('/');
    } catch (err) {
      console.error('Login error:', err);
      setError('Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen app-container w-full"
      style={{ position: 'absolute', top: 0, left: 0, zIndex: 100 }}
    >
      <div
        className="glass-panel p-8 w-full max-w-md animate-fade-in relative z-10 mx-4"
        style={{ backgroundColor: 'rgba(255,255,255,0.95)' }}
      >
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white mb-4 shadow-lg shadow-blue-200">
            <Scale size={32} />
          </div>
          <h1 className="text-2xl font-bold text-center">Law Clinic AI</h1>
          <p className="text-muted text-center mt-2">Sign in to manage your cases</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Email</label>
            <input
              type="email"
              className="w-full p-3 rounded-xl border border-slate-300"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              type="password"
              className="w-full p-3 rounded-xl border border-slate-300"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary py-3 mt-2 w-full text-base"
            disabled={isSubmitting}
          >
            <LogIn size={20} />
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-500">
            Don’t have an account?{' '}
            <Link to="/register" className="text-blue-600 font-medium">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}