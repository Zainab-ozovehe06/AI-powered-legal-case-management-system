import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import casesRouter from './routes/cases.js';
import documentsRouter from './routes/documents.js';
import eventsRouter from './routes/events.js';
import authRouter from './routes/authRoutes.js';
import adminRouter from './routes/adminRoutes.js';
import groupsRouter from './routes/groups.js';
import userRoutes from './routes/users.js';
import settingsRoutes from './routes/settings.js';
import aiRoutes from './routes/ai.js';

dotenv.config();

const app = express();

/*
  This list contains the frontend websites that are allowed
  to send requests to this backend.

  For now, only your local React frontend is allowed.
  Later, after you host your frontend on Vercel, add your
  Vercel frontend link here too.
*/
const allowedOrigins = [
  "http://localhost:5173"
  // Later add your frontend Vercel link here, for example:
  // "https://your-frontend-name.vercel.app"
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin, like browser direct visits or server-to-server checks
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Legal Case Management backend root route is working',
    version: 'root-route-v1'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Legal Case Management API is running',
    version: 'health-route-v1'
  });
});


app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/ai', aiRoutes);
app.use('/api', eventsRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/cases', casesRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);

/*
  Local development server.
  This runs only on your laptop, not on Vercel.
*/
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;