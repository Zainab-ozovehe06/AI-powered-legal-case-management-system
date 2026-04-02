import express from 'express';
import authenticate from '../middleware/authenticate.js';

const router = express.Router();

router.get('/me', authenticate, (req, res) => {
  return res.status(200).json({
    message: 'Current user fetched successfully',
    user: req.currentUser,
  });
});

export default router;