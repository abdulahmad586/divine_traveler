import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { User } from '../types/user';

const COLLECTION = 'users';
const USERNAMES = 'usernames'; // lookup table: username → userId

function docToUser(doc: FirebaseFirestore.DocumentSnapshot): User {
  return { id: doc.id, ...doc.data() } as User;
}

export async function findById(id: string): Promise<User | null> {
  const doc = await db.collection(COLLECTION).doc(id).get();
  return doc.exists ? docToUser(doc) : null;
}

export async function findByUsername(username: string): Promise<User | null> {
  const lookup = await db.collection(USERNAMES).doc(username).get();
  if (!lookup.exists) return null;
  const { userId } = lookup.data() as { userId: string };
  return findById(userId);
}

export async function findManyByIds(ids: string[]): Promise<User[]> {
  if (ids.length === 0) return [];
  const docs = await Promise.all(ids.map((id) => db.collection(COLLECTION).doc(id).get()));
  return docs.filter((d) => d.exists).map(docToUser);
}

export async function upsert(uid: string, name: string, email: string): Promise<User> {
  const ref = db.collection(COLLECTION).doc(uid);
  const doc = await ref.get();

  if (!doc.exists) {
    const username = await generateUniqueUsername(email);
    await db.runTransaction(async (t) => {
      t.set(ref, {
        name,
        email,
        username,
        allowFriendRequests: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      t.set(db.collection(USERNAMES).doc(username), { userId: uid });
    });
  } else {
    await ref.update({ name, email, updatedAt: FieldValue.serverTimestamp() });
  }

  return docToUser(await ref.get());
}

/**
 * Atomically renames a username.
 * Throws if newUsername is already taken.
 */
export async function updateUsername(uid: string, newUsername: string): Promise<void> {
  const userRef = db.collection(COLLECTION).doc(uid);
  const newUsernameRef = db.collection(USERNAMES).doc(newUsername);

  await db.runTransaction(async (t) => {
    const [userDoc, newUsernameDoc] = await Promise.all([
      t.get(userRef),
      t.get(newUsernameRef),
    ]);

    if (!userDoc.exists) throw new Error('User not found');

    // Allow taking your own current username (no-op effectively)
    const currentUsername = (userDoc.data() as User).username;
    if (currentUsername === newUsername) return;

    if (newUsernameDoc.exists) {
      throw Object.assign(new Error('Username is already taken'), { code: 'USERNAME_TAKEN' });
    }

    // Release old username, claim new one
    t.delete(db.collection(USERNAMES).doc(currentUsername));
    t.set(newUsernameRef, { userId: uid });
    t.update(userRef, { username: newUsername, updatedAt: FieldValue.serverTimestamp() });
  });
}

export async function updateSettings(
  uid: string,
  settings: { allowFriendRequests: boolean }
): Promise<void> {
  await db.collection(COLLECTION).doc(uid).update({
    ...settings,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function updateFcmToken(uid: string, fcmToken: string): Promise<void> {
  await db.collection(COLLECTION).doc(uid).update({
    fcmToken,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ─── Internal ────────────────────────────────────────────────────────────────

function deriveUsernameFromEmail(email: string): string {
  let base = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9]+$/, '')
    .replace(/[._-]{2,}/g, '_')
    .slice(0, 37); // leave room for suffix digits

  if (base.length < 3) base = (base + '000').slice(0, 3);

  // Ensure ends with alphanumeric
  base = base.replace(/[._-]+$/, '');
  if (base.length < 3) base = base.padEnd(3, '0');

  return base;
}

async function generateUniqueUsername(email: string): Promise<string> {
  const base = deriveUsernameFromEmail(email);

  const exists = await db.collection(USERNAMES).doc(base).get();
  if (!exists.exists) return base;

  for (let i = 1; i <= 99; i++) {
    const candidate = `${base.slice(0, 37)}${i}`;
    const doc = await db.collection(USERNAMES).doc(candidate).get();
    if (!doc.exists) return candidate;
  }

  // Fallback: use a random suffix
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base.slice(0, 36)}${rand}`;
}
