import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2, Scale, UserPlus } from 'lucide-react';
import { auth, db } from '../services/firebase';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage('');

    const trimmedName = name.trim();

    
    if (!trimmedName) {
      setMessage('Full name is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const user = userCredential.user;

      await updateProfile(user, {
        displayName: trimmedName,
      });

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        name: trimmedName,
        email: user.email,
        role: 'law_student',
        status: 'active',
        createdAt: serverTimestamp(),
        created_at: serverTimestamp(),
      });

      setMessage('Account created successfully.');
      setName('');
      setEmail('');
      setPassword('');
    } catch (error) {
      console.error('Registration error:', error.message);
      setMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-card animate-fade-in">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            <Scale size={32} />
          </div>
          <div className="auth-brand-copy">
            <h1 className="auth-title">Create an Account</h1>
            <p className="auth-subtitle">Join the Law Clinic workspace.</p>
          </div>
        </div>

        <form onSubmit={handleRegister} className="auth-form">
          <label className="auth-field">
            <span className="auth-label">Full Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              autoComplete="name"
              className="auth-input"
              required
            />
          </label>

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
              placeholder="Create a password"
              autoComplete="new-password"
              className="auth-input"
              required
            />
          </label>

          {message ? <p className="auth-message">{message}</p> : null}

          <button type="submit" disabled={isSubmitting} className="auth-submit-button">
            {isSubmitting ? (
              <Loader2 size={18} className="student-loader-icon" />
            ) : (
              <UserPlus size={18} />
            )}
            {isSubmitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer-copy">
          Already have an account?{' '}
          <Link to="/login" className="auth-footer-link">
            Sign in
          </Link>
        </p>
      </section>
    </div>
  );
}
