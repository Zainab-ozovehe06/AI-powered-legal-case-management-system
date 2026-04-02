import { auth, db } from '../config/firebase.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);

    const userRef = db.collection('users').doc(decodedToken.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({ message: 'User profile not found' });
    }

    const userData = userSnap.data();

    if (userData.status !== 'active') {
      return res.status(403).json({ message: 'Account is inactive' });
    }

    req.currentUser = {
      ...userData,
      uid: decodedToken.uid,
      email: decodedToken.email || userData.email || null,
    };

    if (!req.currentUser.uid) {
      return res.status(401).json({ message: 'Authenticated user UID is missing' });
    }

    next();
  } catch (error) {
    console.error('Authentication error:', error.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

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