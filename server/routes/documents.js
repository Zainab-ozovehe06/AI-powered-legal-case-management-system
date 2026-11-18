import express from 'express';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import { admin, db, storage } from '../config/firebase.js';
import { requireAuth } from '../middleware/authenticate.js';
import canAccessCase from '../middleware/canAccessCase.js';
import allowRoles from '../middleware/allowRoles.js';
import { deleteStoredDocument, documentMetadata, readStoredDocument } from '../utils/documentStorage.js';

const router = express.Router();
const fileTypes = new Map([
  ['.pdf', ['application/pdf']], ['.txt', ['text/plain']], ['.md', ['text/plain', 'text/markdown']],
  ['.csv', ['text/csv', 'application/vnd.ms-excel']], ['.rtf', ['application/rtf', 'text/rtf']],
  ['.doc', ['application/msword']], ['.docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['.xls', ['application/vnd.ms-excel']], ['.xlsx', ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']],
  ['.png', ['image/png']], ['.jpg', ['image/jpeg']], ['.jpeg', ['image/jpeg']],
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const accepted = fileTypes.get(path.extname(file.originalname || '').toLowerCase())?.includes(file.mimetype);
    callback(accepted ? null : Object.assign(new Error('Unsupported document type. Upload PDF, Office, text, CSV, RTF, PNG or JPEG files.'), { statusCode: 400 }), Boolean(accepted));
  },
});

const sanitizePathSegment = (value) =>
  String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');

const buildStoredFileName = (originalName) => {
  const extension = path.extname(originalName || '');
  return `${Date.now()}-${randomUUID()}${extension}`;
};

const getUploadRelativePath = (caseId, storedFileName) =>
  path.posix.join('documents', sanitizePathSegment(caseId), storedFileName);

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

router.get('/:caseId', requireAuth, canAccessCase, async (req, res) => {
  try {
    const snapshot = await db.collection('documents').where('case_id', '==', req.params.caseId).get();
    res.json(snapshot.docs.map(documentMetadata));
  } catch { res.status(500).json({ error: 'Unable to load case documents' }); }
});

router.post('/:caseId/upload', requireAuth, allowRoles('admin', 'law_student', 'lawyer'), canAccessCase, upload.single('file'), async (req, res) => {
  let savedFile = null;

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
    const storedFile = storage.bucket().file(relativePath);
    await storedFile.save(file.buffer, { resumable: false, metadata: {
      contentType: file.mimetype, cacheControl: 'private, no-store',
      metadata: { case_id: caseId, uploaded_by_user_id: actorId },
    } });
    savedFile = storedFile;

    const documentRef = db.collection('documents').doc();

    const newDocument = {
      document_type: file.mimetype,
      case_id: caseId,
      file_path: null,
      storage_file_path: relativePath,
      storage_provider: 'firebase_storage',
      uploaded_by_user_id: actorId,
      upload_date: admin.firestore.FieldValue.serverTimestamp(),
      name: displayName,
      size: file.size,
    };

    const batch = db.batch();
    batch.set(documentRef, newDocument);
    batch.set(db.collection('activities').doc(), {
      case_id: caseId,
      court_name: null,
      description: `Uploaded document: ${displayName}`,
      logged_by_user_id: actorId,
      logged_at: admin.firestore.FieldValue.serverTimestamp(),
      type: 'document_upload',
    });
    await batch.commit();
    savedFile = null;

    return res.status(201).json({
      message: 'Document uploaded successfully',
      documentId: documentRef.id,
    });
  } catch (error) {
    console.error('Error handling document upload:', error);

    if (savedFile) {
      await savedFile.delete({ ignoreNotFound: true }).catch(() => {});
    }

    return res.status(500).json({
      error: error.message || 'Internal server error during upload',
    });
  }
});

router.get('/:documentId/download', requireAuth, loadDocument, canAccessCase, async (req, res) => {
  try {
    const documentRecord = req.documentRecord;

    const buffer = await readStoredDocument(documentRecord);

    const downloadName = path.basename(documentRecord.name || 'document');

    res.setHeader('Content-Type', documentRecord.document_type || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    );

    return res.send(buffer);
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

router.patch('/:documentId', requireAuth, allowRoles('admin', 'law_student'), loadDocument, canAccessCase, async (req, res) => {
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

router.delete('/:documentId', requireAuth, allowRoles('admin', 'law_student'), loadDocument, canAccessCase, async (req, res) => {
  try {
    const actorId = req.currentUser?.uid || req.currentUser?.user_id;
    const documentName = req.documentRecord.name || 'document';

    if (!actorId) {
      return res.status(401).json({ error: 'Authenticated user ID missing' });
    }

    await deleteStoredDocument(req.documentRecord);
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

router.use((error, _req, res, _next) => {
  res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : error.statusCode || 400).json({
    error: error.code === 'LIMIT_FILE_SIZE' ? 'Documents must be at most 5 MB' : error.message,
  });
});

export default router;
