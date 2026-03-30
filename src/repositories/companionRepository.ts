import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { CompanionRequest, Companionship, Block } from '../types/companion';

const REQUESTS = 'companionRequests';
const SHIPS = 'companionships';
const BLOCKS = 'blocks';

function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export async function createRequest(
  fromUserId: string,
  fromUsername: string,
  toUserId: string,
  toUsername: string
): Promise<CompanionRequest> {
  const ref = await db.collection(REQUESTS).add({
    fromUserId,
    fromUsername,
    toUserId,
    toUsername,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id, ...(await ref.get()).data() } as CompanionRequest;
}

export async function findRequest(fromUserId: string, toUserId: string): Promise<CompanionRequest | null> {
  const snap = await db
    .collection(REQUESTS)
    .where('fromUserId', '==', fromUserId)
    .where('toUserId', '==', toUserId)
    .limit(1)
    .get();
  return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as CompanionRequest);
}

export async function findRequestById(id: string): Promise<CompanionRequest | null> {
  const doc = await db.collection(REQUESTS).doc(id).get();
  return doc.exists ? ({ id: doc.id, ...doc.data() } as CompanionRequest) : null;
}

export async function getIncomingRequests(toUserId: string): Promise<CompanionRequest[]> {
  const snap = await db
    .collection(REQUESTS)
    .where('toUserId', '==', toUserId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CompanionRequest));
}

export async function getOutgoingRequests(fromUserId: string): Promise<CompanionRequest[]> {
  const snap = await db
    .collection(REQUESTS)
    .where('fromUserId', '==', fromUserId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CompanionRequest));
}

export async function deleteRequest(id: string): Promise<void> {
  await db.collection(REQUESTS).doc(id).delete();
}

export async function deleteAllRequestsBetween(uid1: string, uid2: string): Promise<void> {
  const [snap1, snap2] = await Promise.all([
    db.collection(REQUESTS).where('fromUserId', '==', uid1).where('toUserId', '==', uid2).get(),
    db.collection(REQUESTS).where('fromUserId', '==', uid2).where('toUserId', '==', uid1).get(),
  ]);
  const batch = db.batch();
  [...snap1.docs, ...snap2.docs].forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// ─── Companionships ───────────────────────────────────────────────────────────

export async function createCompanionship(uid1: string, uid2: string): Promise<void> {
  const [a, b] = sortedPair(uid1, uid2);
  await db.collection(SHIPS).add({
    userIds: [a, b],
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function findCompanionship(uid1: string, uid2: string): Promise<Companionship | null> {
  const [a, b] = sortedPair(uid1, uid2);
  const snap = await db
    .collection(SHIPS)
    .where('userIds', '==', [a, b])
    .limit(1)
    .get();
  return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as Companionship);
}

export async function getCompanionships(userId: string): Promise<Companionship[]> {
  const snap = await db
    .collection(SHIPS)
    .where('userIds', 'array-contains', userId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Companionship));
}

export async function countCompanionships(userId: string): Promise<number> {
  const snap = await db
    .collection(SHIPS)
    .where('userIds', 'array-contains', userId)
    .count()
    .get();
  return snap.data().count;
}

export async function deleteCompanionship(uid1: string, uid2: string): Promise<void> {
  const [a, b] = sortedPair(uid1, uid2);
  const snap = await db
    .collection(SHIPS)
    .where('userIds', '==', [a, b])
    .limit(1)
    .get();
  if (!snap.empty) await snap.docs[0].ref.delete();
}

// ─── Blocks ───────────────────────────────────────────────────────────────────

export async function createBlock(blockerUserId: string, blockedUserId: string): Promise<void> {
  await db.collection(BLOCKS).add({
    blockerUserId,
    blockedUserId,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function findBlock(blockerUserId: string, blockedUserId: string): Promise<Block | null> {
  const snap = await db
    .collection(BLOCKS)
    .where('blockerUserId', '==', blockerUserId)
    .where('blockedUserId', '==', blockedUserId)
    .limit(1)
    .get();
  return snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as Block);
}

export async function isBlockedInAnyDirection(uid1: string, uid2: string): Promise<boolean> {
  const [snap1, snap2] = await Promise.all([
    db.collection(BLOCKS).where('blockerUserId', '==', uid1).where('blockedUserId', '==', uid2).limit(1).get(),
    db.collection(BLOCKS).where('blockerUserId', '==', uid2).where('blockedUserId', '==', uid1).limit(1).get(),
  ]);
  return !snap1.empty || !snap2.empty;
}

export async function getBlocks(blockerUserId: string): Promise<Block[]> {
  const snap = await db
    .collection(BLOCKS)
    .where('blockerUserId', '==', blockerUserId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Block));
}

export async function deleteBlock(blockerUserId: string, blockedUserId: string): Promise<void> {
  const block = await findBlock(blockerUserId, blockedUserId);
  if (block) await db.collection(BLOCKS).doc(block.id).delete();
}
