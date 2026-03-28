import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { User } from '../types/user';

const COLLECTION = 'users';

export async function findById(id: string): Promise<User | null> {
  const doc = await db.collection(COLLECTION).doc(id).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as User) : null;
}

export async function upsert(uid: string, name: string, email: string): Promise<void> {
  const ref = db.collection(COLLECTION).doc(uid);
  const doc = await ref.get();

  if (!doc.exists) {
    await ref.set({ name, email, createdAt: FieldValue.serverTimestamp() });
  } else {
    // Update name/email in case they changed, but never overwrite createdAt
    await ref.update({ name, email });
  }
}
