import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import {
  Journey,
  JourneyDetail,
  JourneyMember,
  JourneyStatus,
  ACTIVE_STATUSES,
  STATUS_PRIORITY,
} from '../types/journey';

const JOURNEYS = 'journeys';
const MEMBERS = 'members';

function membersCol(journeyId: string) {
  return db.collection(JOURNEYS).doc(journeyId).collection(MEMBERS);
}

function docToJourney(doc: FirebaseFirestore.DocumentSnapshot): Journey {
  return { id: doc.id, ...doc.data() } as Journey;
}

function docToMember(doc: FirebaseFirestore.DocumentSnapshot): JourneyMember {
  return { userId: doc.id, ...doc.data() } as JourneyMember;
}

export function computeAggregateStatus(statuses: JourneyStatus[]): JourneyStatus {
  if (statuses.length === 0) return 'abandoned';
  return statuses.reduce((best, s) =>
    STATUS_PRIORITY[s] > STATUS_PRIORITY[best] ? s : best
  );
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function create(data: {
  creatorId: string;
  title: string;
  dimensions: string[];
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
  startDate: FirebaseFirestore.Timestamp;
  endDate: FirebaseFirestore.Timestamp;
  totalAyahs: number;
  allowJoining: boolean;
}): Promise<JourneyDetail> {
  const journeyRef = db.collection(JOURNEYS).doc();
  const memberRef = membersCol(journeyRef.id).doc(data.creatorId);

  const batch = db.batch();
  batch.set(journeyRef, {
    creatorId: data.creatorId,
    title: data.title,
    dimensions: data.dimensions,
    startSurah: data.startSurah,
    startAyah: data.startAyah,
    endSurah: data.endSurah,
    endAyah: data.endAyah,
    startDate: data.startDate,
    endDate: data.endDate,
    status: 'active',
    totalAyahs: data.totalAyahs,
    allowJoining: data.allowJoining,
    memberIds: [data.creatorId],
    memberCount: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(memberRef, {
    userId: data.creatorId,
    status: 'active',
    completedAyahs: {},
    completedCount: 0,
    joinedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return (await findDetailById(journeyRef.id))!;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<Journey | null> {
  const doc = await db.collection(JOURNEYS).doc(id).get();
  return doc.exists ? docToJourney(doc) : null;
}

export async function findDetailById(id: string): Promise<JourneyDetail | null> {
  const [journeyDoc, membersSnap] = await Promise.all([
    db.collection(JOURNEYS).doc(id).get(),
    membersCol(id).get(),
  ]);
  if (!journeyDoc.exists) return null;
  return {
    ...docToJourney(journeyDoc),
    members: membersSnap.docs.map(docToMember),
  };
}

export async function findByUserId(userId: string): Promise<JourneyDetail[]> {
  const memberSnap = await db.collectionGroup(MEMBERS)
    .where('userId', '==', userId)
    .orderBy('joinedAt', 'desc')
    .get();
  if (memberSnap.empty) return [];

  const journeyIds = [...new Set(memberSnap.docs.map((d) => d.ref.parent.parent!.id))];
  const results = await Promise.all(journeyIds.map((id) => findDetailById(id)));
  return (results.filter(Boolean) as JourneyDetail[])
    .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
}

export async function getMember(journeyId: string, userId: string): Promise<JourneyMember | null> {
  const doc = await membersCol(journeyId).doc(userId).get();
  return doc.exists ? docToMember(doc) : null;
}

export async function countActiveByUserId(userId: string): Promise<number> {
  const snap = await db.collectionGroup(MEMBERS)
    .where('userId', '==', userId)
    .where('status', 'in', ACTIVE_STATUSES)
    .count()
    .get();
  return snap.data().count;
}

export async function sumCompletedAyahs(userId: string): Promise<number> {
  const snap = await db.collectionGroup(MEMBERS)
    .where('userId', '==', userId)
    .orderBy('joinedAt', 'desc')
    .get();
  return snap.docs.reduce((sum, d) => sum + ((d.data().completedCount as number) || 0), 0);
}

// ─── Membership ───────────────────────────────────────────────────────────────

export async function addMember(journeyId: string, userId: string): Promise<void> {
  const batch = db.batch();
  batch.set(membersCol(journeyId).doc(userId), {
    userId,
    status: 'active',
    completedAyahs: {},
    completedCount: 0,
    joinedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  // An active new member always makes the aggregate active (highest priority)
  batch.update(db.collection(JOURNEYS).doc(journeyId), {
    memberIds: FieldValue.arrayUnion(userId),
    memberCount: FieldValue.increment(1),
    status: 'active',
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

export async function removeMember(journeyId: string, userId: string): Promise<void> {
  await db.runTransaction(async (t) => {
    const journeyRef = db.collection(JOURNEYS).doc(journeyId);
    const memberRef = membersCol(journeyId).doc(userId);

    const journeyDoc = await t.get(journeyRef);
    const journey = journeyDoc.data() as Journey;

    const remainingIds = journey.memberIds.filter((id) => id !== userId);
    const remainingDocs = await Promise.all(
      remainingIds.map((id) => t.get(membersCol(journeyId).doc(id)))
    );
    const remainingStatuses = remainingDocs
      .filter((d) => d.exists)
      .map((d) => (d.data() as JourneyMember).status);

    const aggregateStatus = computeAggregateStatus(remainingStatuses);

    t.delete(memberRef);
    t.update(journeyRef, {
      memberIds: FieldValue.arrayRemove(userId),
      memberCount: FieldValue.increment(-1),
      status: aggregateStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export async function applyProgress(
  journeyId: string,
  userId: string,
  keys: string[],
  newMemberStatus: JourneyStatus
): Promise<JourneyDetail> {
  await db.runTransaction(async (t) => {
    const journeyRef = db.collection(JOURNEYS).doc(journeyId);
    const memberRef = membersCol(journeyId).doc(userId);

    // All reads first
    const [journeyDoc, memberDoc] = await Promise.all([
      t.get(journeyRef),
      t.get(memberRef),
    ]);

    const journey = journeyDoc.data() as Journey;
    const member = memberDoc.data() as JourneyMember;

    const otherIds = journey.memberIds.filter((id) => id !== userId);
    const otherDocs = await Promise.all(
      otherIds.map((id) => t.get(membersCol(journeyId).doc(id)))
    );

    // Build dot-notation updates for completedAyahs map
    const updates: Record<string, unknown> = {};
    let newCount = member.completedCount;
    for (const key of keys) {
      if (!member.completedAyahs[key]) {
        updates[`completedAyahs.${key}`] = true;
        newCount++;
      }
    }

    const allStatuses: JourneyStatus[] = [
      newMemberStatus,
      ...otherDocs.filter((d) => d.exists).map((d) => (d.data() as JourneyMember).status),
    ];
    const aggregateStatus = computeAggregateStatus(allStatuses);

    // All writes
    t.update(memberRef, {
      ...updates,
      completedCount: newCount,
      status: newMemberStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.update(journeyRef, {
      status: aggregateStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return (await findDetailById(journeyId))!;
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function updateMemberStatus(
  journeyId: string,
  userId: string,
  newStatus: JourneyStatus
): Promise<JourneyDetail> {
  await db.runTransaction(async (t) => {
    const journeyRef = db.collection(JOURNEYS).doc(journeyId);

    const journeyDoc = await t.get(journeyRef);
    const journey = journeyDoc.data() as Journey;

    const otherIds = journey.memberIds.filter((id) => id !== userId);
    const otherDocs = await Promise.all(
      otherIds.map((id) => t.get(membersCol(journeyId).doc(id)))
    );

    const allStatuses: JourneyStatus[] = [
      newStatus,
      ...otherDocs.filter((d) => d.exists).map((d) => (d.data() as JourneyMember).status),
    ];
    const aggregateStatus = computeAggregateStatus(allStatuses);

    t.update(membersCol(journeyId).doc(userId), {
      status: newStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.update(journeyRef, {
      status: aggregateStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return (await findDetailById(journeyId))!;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function updateJourneySettings(
  journeyId: string,
  settings: { allowJoining: boolean }
): Promise<void> {
  await db.collection(JOURNEYS).doc(journeyId).update({
    ...settings,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ─── Delayed sync ─────────────────────────────────────────────────────────────

/**
 * Lazily syncs members whose status should be 'delayed' based on the journey endDate.
 * Called on every detail fetch to keep statuses accurate without a background job.
 */
export async function syncDelayedMembers(detail: JourneyDetail): Promise<JourneyDetail> {
  const endMs = detail.endDate.seconds * 1000;
  if (Date.now() <= endMs) return detail;

  const toDelay = detail.members.filter(
    (m) => m.status === 'active' || m.status === 'paused'
  );
  if (toDelay.length === 0) return detail;

  const batch = db.batch();
  for (const m of toDelay) {
    batch.update(membersCol(detail.id).doc(m.userId), {
      status: 'delayed',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const updatedMembers = detail.members.map((m) =>
    toDelay.some((td) => td.userId === m.userId)
      ? { ...m, status: 'delayed' as JourneyStatus }
      : m
  );
  const aggregateStatus = computeAggregateStatus(updatedMembers.map((m) => m.status));

  batch.update(db.collection(JOURNEYS).doc(detail.id), {
    status: aggregateStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();
  return { ...detail, status: aggregateStatus, members: updatedMembers };
}
