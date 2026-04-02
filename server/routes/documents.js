import express from 'express';
import multer from 'multer';
import { admin, db } from '../config/firebase.js';
import { requireAuth } from '../middleware/authenticate.js';

const router = express.Router();

// Step 6: Create Upload Document API
// Setup multer for memory storage (we'll upload to Firebase directly from memory buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { case_id } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!case_id) {
      return res.status(400).json({ error: 'Missing associated case_id in request body' });
    }

    // Verify case exists
    const caseDoc = await db.collection('cases').doc(case_id).get();
    if (!caseDoc.exists) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const bucket = admin.storage().bucket();
    // Use a unique file name to avoid collisions
    const fileExtension = file.originalname.split('.').pop();
    const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
    const destinationPath = `documents/${case_id}/${uniqueFileName}`;

    const fileUpload = bucket.file(destinationPath);
    
    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype
      }
    });

    stream.on('error', (err) => {
      console.error('Error uploading to Firebase Storage:', err);
      res.status(500).json({ error: 'Failed to upload document' });
    });

    stream.on('finish', async () => {
      // Make the file publicly accessible or generate a signed URL
      // For simplicity, let's get the public URL or store the reference path.
      // Often, you might want it private and generate signed URLs on demand,
      // but let's just store the reference path in Firestore.
      
      const [url] = await fileUpload.getSignedUrl({
        action: 'read',
        expires: '03-09-2491' // Far future for simplicity or use getDownloadURL equivalent
      });

      const newDocument = {
        document_type: file.mimetype,
        case_id: case_id,
        file_path: url, // Or store the destinationPath to generate short-lived signed URLs later
        uploaded_by: req.user.uid,
        upload_date: admin.firestore.FieldValue.serverTimestamp(),
        name: file.originalname,  // Keeping some useful extra metadata
        size: file.size           // Keeping some useful extra metadata
      };

      const docRef = await db.collection('documents').add(newDocument);

      // Log activity for document upload
      await db.collection('activities').add({
        case_id: case_id,
        court_name: null,
        description: `Uploaded document: ${file.originalname}`,
        logged_by: req.user.uid,
        date: admin.firestore.FieldValue.serverTimestamp()
      });

      res.status(201).json({
        message: 'Document uploaded successfully',
        documentId: docRef.id,
        url: url
      });
    });

    // End the stream with the buffer
    stream.end(file.buffer);

  } catch (error) {
    console.error('Error handling document upload:', error);
    res.status(500).json({ error: 'Internal server error during upload' });
  }
});

export default router;
