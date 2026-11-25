import express from 'express';
import authenticate, { requireFirebaseUser } from '../middleware/authenticate.js';
import { createSession, recordSessionActivity, revokeSession } from '../utils/authSession.js';

const router = express.Router();

const handleSessionError = (res, error) => res.status(error.statusCode || 503).json({
  code: error.code || 'AUTH_UNAVAILABLE',
  message: error.statusCode ? error.message : 'Unable to verify your session. Please try again.',
});

router.post('/session', requireFirebaseUser, async (req, res) => {
  try {
    const session = await createSession(req.firebaseIdentity);
    return res.status(201).json({ session, user: req.currentUser });
  } catch (error) { return handleSessionError(res, error); }
});

router.get('/session', authenticate, (req, res) => {
  return res.json({ session: req.appSession, user: req.currentUser });
});

// Only actual browser interaction calls this endpoint. Background API reads,
// focus checks and Firebase token refreshes must not prolong a session.
router.put('/session/activity', authenticate, async (req, res) => {
  try {
    const session = await recordSessionActivity(req.headers['x-session-id'], req.firebaseIdentity);
    return res.json({ session });
  } catch (error) { return handleSessionError(res, error); }
});

router.delete('/session', requireFirebaseUser, async (req, res) => {
  try {
    await revokeSession(req.headers['x-session-id'], req.firebaseIdentity);
    return res.json({ message: 'Signed out' });
  } catch (error) { return handleSessionError(res, error); }
});

router.get('/me', authenticate, (req, res) => {
  return res.status(200).json({
    message: 'Current user fetched successfully',
    user: req.currentUser,
  });
});

export default router;
