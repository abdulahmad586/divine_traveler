import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { Journey, CreateJourneyData, ACTIVE_STATUSES, JourneyStatus } from '../types/journey';

const COLLECTION = 'journeys';

function docToJourney(doc: FirebaseFirestore.DocumentSnapshot): Journey {
  return { id: doc.id, ...doc.data() } as Journey;
}

export async function create(data: CreateJourneyData): Promise<Journey> {
  const ref = await db.collection(COLLECTION).add({
    ...data,
    status: 'active',
    completedAyahs: {},
    completedCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return docToJourney(await ref.get());
}

export async function findById(id: string): Promise<Journey | null> {
  const doc = await db.collection(COLLECTION).doc(id).get();
  return doc.exists ? docToJourney(doc) : null;
}

export async function findByUserId(userId: string): Promise<Journey[]> {
  const snap = await db
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map(docToJourney);
}

export async function countActiveByUserId(userId: string): Promise<number> {
  const snap = await db
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .where('status', 'in', ACTIVE_STATUSES)
    .count()
    .get();
  return snap.data().count;
}

export async function updateStatus(id: string, status: JourneyStatus): Promise<void> {
  await db.collection(COLLECTION).doc(id).update({
    status,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Atomically marks a set of ayah keys as completed and updates status.
 * Returns the updated journey.
 */
export async function applyProgress(
  id: string,
  ayahKeys: string[],
  newStatus: JourneyStatus
): Promise<Journey> {
  const ref = db.collection(COLLECTION).doc(id);

  return db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    const journey = docToJourney(doc);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {
      status: newStatus,
      updatedAt: FieldValue.serverTimestamp(),
    };

    let newlyCompleted = 0;
    for (const key of ayahKeys) {
      if (!journey.completedAyahs[key]) {
        updates[`completedAyahs.${key}`] = true;
        newlyCompleted++;
      }
    }

    updates['completedCount'] = FieldValue.increment(newlyCompleted);

    t.update(ref, updates);

    // Return an optimistic version for the response
    return {
      ...journey,
      completedCount: journey.completedCount + newlyCompleted,
      status: newStatus,
    } as Journey;
  });
}
