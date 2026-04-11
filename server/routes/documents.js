import express from 'express';
import multer from 'multer';
import { admin, db } from '../config/firebase.js';
import { requireAuth } from '../middleware/authenticate.js';
import canAccessCase from '../middleware/canAccessCase.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post('/:caseId/upload', requireAuth, canAccessCase, upload.single('file'), async (req, res) => {
  try {
    const { caseId } = req.params;
    const file = req.file;
    const actorId = req.currentUser?.uid || req.currentUser?.user_id;

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const caseDoc = await db.collection('cases').doc(caseId).get();
    if (!caseDoc.exists) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const bucket = admin.storage().bucket();

    const hasExtension = file.originalname.includes('.');
    const extension = hasExtension ? file.originalname.split('.').pop() : 'bin';

    const uniqueFileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${extension}`;
    const destinationPath = `documents/${caseId}/${uniqueFileName}`;

    const fileUpload = bucket.file(destinationPath);

    await fileUpload.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
    });

    const [url] = await fileUpload.getSignedUrl({
      action: 'read',
      expires: '03-09-2491',
    });

    const newDocument = {
      document_type: file.mimetype,
      case_id: caseId,
      file_path: url,
      uploaded_by_user_id: actorId,
      upload_date: admin.firestore.FieldValue.serverTimestamp(),
      name: file.originalname,
      size: file.size,
    };

    const docRef = await db.collection('documents').add(newDocument);

    await db.collection('activities').add({
      case_id: caseId,
      court_name: null,
      description: `Uploaded document: ${file.originalname}`,
      logged_by_user_id: actorId,
      logged_at: admin.firestore.FieldValue.serverTimestamp(),
      type: 'document_upload',
    });

    return res.status(201).json({
      message: 'Document uploaded successfully',
      documentId: docRef.id,
      url,
    });
  } catch (error) {
    console.error('Error handling document upload:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error during upload',
    });
  }
});

export default router;