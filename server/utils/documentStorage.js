import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storage } from '../config/firebase.js';

const uploadsRoot = fileURLToPath(new URL('../uploads/', import.meta.url));
export const resolveUploadPath = (relativePath) => {
  const absolutePath = path.resolve(uploadsRoot, path.normalize(relativePath || ''));
  const relative = path.relative(uploadsRoot, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid document path');
  return absolutePath;
};

const storedObject = (document) => {
  const bucket = storage.bucket();
  let objectPath = document.storage_file_path;
  // Keep legacy Firebase records readable through authenticated downloads.
  // Never fetch arbitrary URLs or forward Firebase download tokens to clients.
  if (!objectPath && document.file_path) {
    const url = new URL(document.file_path);
    if (url.protocol === 'gs:' && url.hostname === bucket.name) objectPath = decodeURIComponent(url.pathname.slice(1));
    if (url.protocol === 'https:' && url.hostname === 'firebasestorage.googleapis.com') {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (match && decodeURIComponent(match[1]) === bucket.name) objectPath = decodeURIComponent(match[2]);
    }
  }
  if (!objectPath || objectPath.startsWith('/') || objectPath.split('/').includes('..')) throw new Error('Document storage location is unavailable');
  return bucket.file(objectPath);
};

export const readStoredDocument = async (document, maxBytes = 5 * 1024 * 1024) => {
  if (document.server_file_path) {
    const filename = resolveUploadPath(document.server_file_path);
    const stats = await fs.stat(filename);
    if (stats.size > maxBytes) throw new Error('Document exceeds the size limit');
    return fs.readFile(filename);
  }
  const file = storedObject(document);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) > maxBytes) throw new Error('Document exceeds the size limit');
  const [buffer] = await file.download();
  if (buffer.length > maxBytes) throw new Error('Document exceeds the size limit');
  return buffer;
};

export const deleteStoredDocument = async (document) => {
  if (document.server_file_path) {
    return fs.unlink(resolveUploadPath(document.server_file_path)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
  return storedObject(document).delete({ ignoreNotFound: true });
};

export const documentMetadata = (doc) => {
  const { file_path, server_file_path, storage_file_path, ...metadata } = doc.data();
  return { ...metadata, id: doc.id };
};
