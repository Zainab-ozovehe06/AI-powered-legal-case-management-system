import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatPrivateKey(privateKey) {
  return privateKey
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n');
}

function getFirebaseCredential() {
  const hasFirebaseEnv =
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY;

  // Vercel / production: use environment variables
  if (hasFirebaseEnv) {
    return admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    });
  }

  // Local development: use serviceAccountKey.json one folder above this file
  const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `Firebase credentials are missing. For local development, place serviceAccountKey.json at: ${serviceAccountPath}. For Vercel, set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.`
    );
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  return admin.credential.cert(serviceAccount);
}

function getFirebaseAppOptions() {
  const options = {
    credential: getFirebaseCredential(),
  };

  // Only add Storage bucket if you are actually using Firebase Storage
  if (process.env.FIREBASE_STORAGE_BUCKET) {
    options.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  }

  return options;
}

if (!admin.apps.length) {
  admin.initializeApp(getFirebaseAppOptions());
}

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

export { admin, db, auth, storage };
export default admin;