import { auth, db } from '../config/firebase.js';
import { validateSession } from '../utils/authSession.js';

// Used without an app session only to start/end one after Firebase sign-in.
export const requireFirebaseUser = async (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 'TOKEN_MISSING', message: 'No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken, true);
    req.firebaseIdentity = decodedToken;

    const userRef = db.collection('users').doc(decodedToken.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(403).json({ code: 'PROFILE_NOT_FOUND', message: 'No clinic profile exists for this account. Contact an administrator.' });
    }

    const userData = userSnap.data();

    if (userData.status !== 'active') {
      return res.status(403).json({ code: 'ACCOUNT_INACTIVE', message: 'Account is inactive. Contact an administrator.' });
    }

    req.currentUser = {
      ...userData,
      uid: decodedToken.uid,
      email: decodedToken.email || userData.email || null,
    };

    if (!req.currentUser.uid) {
      return res.status(401).json({ message: 'Authenticated user UID is missing' });
    }

    if (!['admin', 'law_student', 'supervisor', 'lawyer', 'client'].includes(req.currentUser.role)) {
      return res.status(403).json({ code: 'ROLE_INVALID', message: 'Your account does not have a valid clinic role. Contact an administrator.' });
    }

    return next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Firebase token expired' });
    }
    if (error.code?.startsWith('auth/') && !['auth/internal-error', 'auth/network-request-failed'].includes(error.code)) {
      return res.status(401).json({ code: 'TOKEN_INVALID', message: 'Invalid or revoked token. Please sign in again.' });
    }
    return res.status(503).json({ code: 'AUTH_UNAVAILABLE', message: 'Unable to verify your account. Please try again.' });
  }
};

export const requireAuth = (req, res, next) => requireFirebaseUser(req, res, async () => {
  try {
    req.appSession = await validateSession(req.headers['x-session-id'], req.firebaseIdentity);
    next();
  } catch (error) {
    res.status(error.statusCode || 503).json({
      code: error.code || 'AUTH_UNAVAILABLE',
      message: error.statusCode ? error.message : 'Unable to verify your session. Please try again.',
    });
  }
});

export const requireStudentRole = (req, res, next) => {
  if (!req.currentUser) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  if (req.currentUser.role !== 'law_student') {
    return res.status(403).json({ message: 'Access denied. Law student only.' });
  }

  next();
};

export const requireAdminRole = (req, res, next) => {
  if (!req.currentUser) {
    return res.status(401).json({ message: 'Unauthenticated' });
  }

  if (req.currentUser.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }

  next();
};

const authenticate = requireAuth;
export default authenticate;
