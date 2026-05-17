import express from 'express';
import fs from 'fs/promises';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { admin, db } from '../config/firebase.js';
import { requireAuth } from '../middleware/authenticate.js';
import canAccessCase from '../middleware/canAccessCase.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '..', 'uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const sanitizePathSegment = (value) =>
  String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');

const buildStoredFileName = (originalName) => {
  const extension = path.extname(originalName || '');
  return `${Date.now()}-${randomUUID()}${extension}`;
};

const getUploadRelativePath = (caseId, storedFileName) =>
  path.posix.join('documents', sanitizePathSegment(caseId), storedFileName);

const resolveUploadPath = (relativePath) => {
  const absolutePath = path.resolve(uploadsRoot, path.normalize(relativePath || ''));
  const relativeToRoot = path.relative(uploadsRoot, absolutePath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new Error('Invalid document path');
  }

  return absolutePath;
};

const deleteStoredFile = async (documentRecord) => {
  if (!documentRecord?.server_file_path) return;

  const absolutePath = resolveUploadPath(documentRecord.server_file_path);
  await fs.unlink(absolutePath).catch((error) => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  });
};

const loadDocument = async (req, res, next) => {
  try {
    const documentRef = db.collection('documents').doc(req.params.documentId);
    const documentSnap = await documentRef.get();

    if (!documentSnap.exists) {
      return res.status(404).json({ error: 'Document not found' });
    }

    req.documentRecord = {
      id: documentSnap.id,
      ref: documentRef,
      ...documentSnap.data(),
    };

    req.params.caseId = req.documentRecord.case_id;
    return next();
  } catch (error) {
    console.error('Error loading document:', error);
    return res.status(500).json({ error: 'Failed to load document' });
  }
};

router.post('/:caseId/upload', requireAuth, canAccessCase, upload.single('file'), async (req, res) => {
  let savedFilePath = null;

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

    const displayName = path.basename(file.originalname || 'document');
    const storedFileName = buildStoredFileName(displayName);
    const relativePath = getUploadRelativePath(caseId, storedFileName);
    const absolutePath = resolveUploadPath(relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, file.buffer);
    savedFilePath = absolutePath;

    const documentRef = db.collection('documents').doc();

    const newDocument = {
      document_type: file.mimetype,
      case_id: caseId,
      file_path: null,
      server_file_path: relativePath,
      storage_provider: 'local_server',
      uploaded_by_user_id: actorId,
      upload_date: admin.firestore.FieldValue.serverTimestamp(),
      name: displayName,
      size: file.size,
    };

    await documentRef.set(newDocument);

    await db.collection('activities').add({
      case_id: caseId,
      court_name: null,
      description: `Uploaded document: ${displayName}`,
      logged_by_user_id: actorId,
      logged_at: admin.firestore.FieldValue.serverTimestamp(),
      type: 'document_upload',
    });

    return res.status(201).json({
      message: 'Document uploaded successfully',
      documentId: documentRef.id,
    });
  } catch (error) {
    console.error('Error handling document upload:', error);

    if (savedFilePath) {
      await fs.unlink(savedFilePath).catch(() => {});
    }

    return res.status(500).json({
      error: error.message || 'Internal server error during upload',
    });
  }
});

router.get('/:documentId/download', requireAuth, loadDocument, canAccessCase, async (req, res) => {
  try {
    const documentRecord = req.documentRecord;

    if (!documentRecord.server_file_path) {
      return res.status(400).json({ error: 'Document file is not stored on this server' });
    }

    const absolutePath = resolveUploadPath(documentRecord.server_file_path);
    await fs.access(absolutePath);

    const downloadName = path.basename(documentRecord.name || 'document');

    res.setHeader('Content-Type', documentRecord.document_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${downloadName.replace(/"/g, '')}"`
    );

    return res.sendFile(absolutePath);
  } catch (error) {
    console.error('Error serving document download:', error);

    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Stored document file not found' });
    }

    return res.status(500).json({
      error: error.message || 'Failed to serve document',
    });
  }
});

router.patch('/:documentId', requireAuth, loadDocument, canAccessCase, async (req, res) => {
  try {
    const actorId = req.currentUser?.uid || req.currentUser?.user_id;
    const nextName = path.basename(req.body?.name?.toString().trim() || '');

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    if (!nextName) {
      return res.status(400).json({ error: 'Document name is required' });
    }

    await req.documentRecord.ref.update({
      name: nextName,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by_user_id: actorId,
    });

    return res.status(200).json({
      message: 'Document updated successfully',
      document: {
        id: req.documentRecord.id,
        name: nextName,
      },
    });
  } catch (error) {
    console.error('Error updating document:', error);
    return res.status(500).json({
      error: error.message || 'Failed to update document',
    });
  }
});

router.delete('/:documentId', requireAuth, loadDocument, canAccessCase, async (req, res) => {
  try {
    const actorId = req.currentUser?.uid || req.currentUser?.user_id;
    const documentName = req.documentRecord.name || 'document';

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    await deleteStoredFile(req.documentRecord);
    await req.documentRecord.ref.delete();

    await db.collection('activities').add({
      case_id: req.documentRecord.case_id,
      court_name: null,
      description: `Deleted document: ${documentName}`,
      logged_by_user_id: actorId,
      logged_at: admin.firestore.FieldValue.serverTimestamp(),
      type: 'document_delete',
    });

    return res.status(200).json({
      message: 'Document deleted successfully',
      documentId: req.documentRecord.id,
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    return res.status(500).json({
      error: error.message || 'Failed to delete document',
    });
  }
});

export default router;
