import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { Contribution, CreateContributionData } from '../types/contribution';

const COLLECTION = 'contributions';

function docToContribution(doc: FirebaseFirestore.DocumentSnapshot): Contribution {
  const data = doc.data()!;
  return { id: doc.id, ...data } as Contribution;
}

export async function findByHash(audioHash: string): Promise<Contribution | null> {
  const snap = await db
    .collection(COLLECTION)
    .where('audioHash', '==', audioHash)
    .where('status', '!=', 'rejected')
    .limit(1)
    .get();
  return snap.empty ? null : docToContribution(snap.docs[0]);
}

export async function findByReciterAndSurah(
  reciterName: string,
  surah: number
): Promise<Contribution | null> {
  const snap = await db
    .collection(COLLECTION)
    .where('reciterName', '==', reciterName)
    .where('surah', '==', surah)
    .where('status', '!=', 'rejected')
    .limit(1)
    .get();
  return snap.empty ? null : docToContribution(snap.docs[0]);
}

export async function findBySurah(surah: number, onlyApproved: boolean = true): Promise<Contribution[]> {
  
  const snap = onlyApproved ? await db
    .collection(COLLECTION)
    .where('surah', '==', surah)
    .where('status', '==', 'approved')
    .orderBy('createdAt', 'desc')
    .get() : await db
    .collection(COLLECTION)
    .where('surah', '==', surah)
    .orderBy('createdAt', 'desc')
    .get();
  
  return snap.docs.map(docToContribution);
}

export async function findById(id: string): Promise<Contribution | null> {
  const doc = await db.collection(COLLECTION).doc(id).get();
  return doc.exists ? docToContribution(doc) : null;
}

export async function create(data: CreateContributionData): Promise<Contribution> {
  const ref = await db.collection(COLLECTION).add({
    ...data,
    status: 'pending',
    downloads: 0,
    likes: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  const doc = await ref.get();
  return docToContribution(doc);
}

export async function incrementField(
  id: string,
  field: 'likes' | 'downloads'
): Promise<void> {
  await db.collection(COLLECTION).doc(id).update({ [field]: FieldValue.increment(1) });
}

export async function deleteById(id: string): Promise<void> {
  await db.collection(COLLECTION).doc(id).delete();
}
