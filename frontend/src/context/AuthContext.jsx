import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { auth, authReady, db } from '../services/firebase';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  beginSession, endSession, LOGOUT_KEY, monitorSession, readSession,
  SESSION_ENDED, validateCurrentSession,
} from '../services/authSession';

const AuthContext = createContext({});
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
const EXPIRED_MESSAGE = 'Your session expired after 15 minutes of inactivity. Please sign in again.';

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState('');
  const generation = useRef(0);
  const signingIn = useRef(false);
  const persistenceReady = useRef(false);

  const applyProfile = useCallback((profile) => {
    setCurrentUser(profile);
    setUserRole(profile?.role || null);
  }, []);

  const logout = useCallback(async (reason = '') => {
    generation.current += 1;
    applyProfile(null);
    setLoading(false);
    setSessionMessage(typeof reason === 'string' ? reason : '');
    // Clear protected React state and application credentials immediately.
    // Remote revocation and Firebase sign-out then finish independently.
    const ending = endSession();
    await Promise.allSettled([ending, signOut(auth)]);
  }, [applyProfile]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe;
    const restore = async (user) => {
      if (cancelled || signingIn.current) return;
      const attempt = ++generation.current;
      try {
        if (!user) { applyProfile(null); return; }
        if (readSession()?.uid !== user.uid) {
          // A restored Firebase credential cannot start an application session.
          // Only an explicit sign-in may create one.
          await logout();
          return;
        }
        const profile = await validateCurrentSession();
        if (!cancelled && attempt === generation.current) applyProfile(profile);
      } catch (error) {
        if (!cancelled && attempt === generation.current) await logout(error.message || 'Please sign in again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    authReady.then(() => {
      persistenceReady.current = true;
      if (!cancelled) unsubscribe = onAuthStateChanged(auth, restore);
    }).catch(() => {
      if (!cancelled) {
        setSessionMessage('Your browser could not enable secure sign-in storage. Allow site storage and try again.');
        setLoading(false);
      }
    });
    const onEnded = (event) => { logout(event.detail || EXPIRED_MESSAGE); };
    const onStorage = (event) => {
      if (event.key !== LOGOUT_KEY || !auth.currentUser) return;
      try {
        if (JSON.parse(event.newValue)?.uid === auth.currentUser.uid) logout('You were signed out in another tab. Please sign in again.');
      } catch { /* Ignore malformed storage notifications. */ }
    };
    // Hide content before browser history snapshots; revalidate before revealing
    // a document restored from the back/forward cache.
    const onPageHide = () => { document.documentElement.style.visibility = 'hidden'; };
    const onPageShow = async (event) => {
      if (event.persisted) {
        setLoading(true);
        try { await restore(auth.currentUser); }
        finally { if (!cancelled) setLoading(false); }
      }
      document.documentElement.style.visibility = '';
    };
    window.addEventListener(SESSION_ENDED, onEnded);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      cancelled = true;
      unsubscribe?.();
      window.removeEventListener(SESSION_ENDED, onEnded);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      document.documentElement.style.visibility = '';
    };
  }, [applyProfile, logout]);

  useEffect(() => {
    if (currentUser) return monitorSession(() => logout(EXPIRED_MESSAGE), setLoading);
  }, [currentUser, logout]);

  const authenticate = async (signIn) => {
    if (!persistenceReady.current) throw new Error('Secure sign-in storage is unavailable. Allow site storage and reload the page.');
    if (signingIn.current) throw new Error('A sign-in is already in progress.');
    signingIn.current = true;
    const attempt = ++generation.current;
    setSessionMessage('');
    try {
      // Persistence is ready before this form is shown. Open popups directly
      // from the click, without awaiting unrelated requests first.
      const credential = await signIn();
      const profile = await beginSession(credential.user);
      if (attempt !== generation.current) throw new Error('Sign-in was cancelled. Please try again.');
      applyProfile(profile);
      return credential;
    } catch (error) {
      await logout();
      throw error;
    } finally { signingIn.current = false; }
  };

  const login = (email, password) => authenticate(() => signInWithEmailAndPassword(auth, email.trim(), password));
  const loginWithGoogle = () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return authenticate(() => signInWithPopup(auth, provider));
  };

  const register = async (name, email, password) => {
    await authReady;
    if (signingIn.current) throw new Error('Authentication is already in progress.');
    signingIn.current = true;
    generation.current += 1;
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(user, { displayName: name.trim() });
      // Preserve existing onboarding and its UID. Sign-in does not create
      // profiles, assign roles, or look up or overwrite accounts by email.
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid, name: name.trim(), email: user.email,
        role: 'law_student', status: 'active',
        createdAt: serverTimestamp(), created_at: serverTimestamp(),
      });
    } finally {
      await logout();
      signingIn.current = false;
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, userRole, login, loginWithGoogle, register, logout, loading, sessionMessage }}>
      {loading ? <div className="auth-page" role="status">Verifying your session...</div> : children}
    </AuthContext.Provider>
  );
};
