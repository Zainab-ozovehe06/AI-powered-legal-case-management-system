import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import casesRouter from './routes/cases.js';
import documentsRouter from './routes/documents.js';
import authRouter from './routes/authRoutes.js';
import adminRouter from './routes/adminRoutes.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/cases', casesRouter);
app.use('/api/documents', documentsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Legal Case Management API is running' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});