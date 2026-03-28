import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config();

if (!admin.apps.length) {
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (serviceAccountEnv) {
    const serviceAccount = JSON.parse(serviceAccountEnv) as admin.ServiceAccount;
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    // Falls back to GOOGLE_APPLICATION_CREDENTIALS env var or GCP default credentials
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
}

export const db = admin.firestore();
export const auth = admin.auth();
export default admin;
