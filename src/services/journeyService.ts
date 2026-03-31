import * as repo from '../repositories/journeyRepository';
import * as userRepo from '../repositories/userRepository';
import * as companionRepo from '../repositories/companionRepository';
import {
  JourneyDetail,
  JourneyMember,
  JourneyStatus,
  MAX_ACTIVE_JOURNEYS,
  ACTIVE_STATUSES,
} from '../types/journey';
import {
  CreateJourneyBody,
  UpdateProgressBody,
  UpdateStatusBody,
  UpdateJourneySettingsBody,
} from '../validators/journeyValidator';
import {
  isValidAyah,
  isValidSurah,
  toLinearIndex,
  countAyahsInRange,
  ayahKeysForSurahInRange,
  formatRange,
} from '../data/quran';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';
import * as notificationService from './notificationService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateTitle(body: CreateJourneyBody): string {
  const dimLabels: Record<string, string> = {
    read: 'Read',
    memorize: 'Memorize',
    translate: 'Translate',
    commentary: 'Commentary',
  };
  const dims = body.dimensions.map((d) => dimLabels[d]);
  const dimStr =
    dims.length === 1
      ? dims[0]
      : dims.slice(0, -1).join(', ') + ' & ' + dims[dims.length - 1];
  return `${dimStr}: ${formatRange(body.startSurah, body.startAyah, body.endSurah, body.endAyah)}`;
}

async function getDetailOrThrow(id: string): Promise<JourneyDetail> {
  const journey = await repo.findDetailById(id);
  if (!journey) throw new NotFoundError(`Journey ${id} not found`);
  return repo.syncDelayedMembers(journey);
}

function getMemberOrThrow(journey: JourneyDetail, userId: string): JourneyMember {
  const member = journey.members.find((m) => m.userId === userId);
  if (!member) throw new ForbiddenError('You are not a member of this journey');
  return member;
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function create(userId: string, body: CreateJourneyBody): Promise<JourneyDetail> {
  if (!isValidSurah(body.startSurah) || !isValidAyah(body.startSurah, body.startAyah)) {
    throw new ValidationError(`Surah ${body.startSurah} Ayah ${body.startAyah} does not exist`);
  }
  if (!isValidSurah(body.endSurah) || !isValidAyah(body.endSurah, body.endAyah)) {
    throw new ValidationError(`Surah ${body.endSurah} Ayah ${body.endAyah} does not exist`);
  }

  const startIdx = toLinearIndex(body.startSurah, body.startAyah);
  const endIdx = toLinearIndex(body.endSurah, body.endAyah);
  if (startIdx >= endIdx) {
    throw new ValidationError('Start position must come before end position');
  }

  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  if (startDate >= endDate) {
    throw new ValidationError('startDate must be before endDate');
  }

  const activeCount = await repo.countActiveByUserId(userId);
  if (activeCount >= MAX_ACTIVE_JOURNEYS) {
    throw new ConflictError(
      `You already have ${MAX_ACTIVE_JOURNEYS} active journeys. Complete or abandon one before creating a new one.`,
      'MAX_ACTIVE_JOURNEYS'
    );
  }

  const title = body.title?.trim() || generateTitle(body);
  const totalAyahs = countAyahsInRange(body.startSurah, body.startAyah, body.endSurah, body.endAyah);

  const journey = await repo.create({
    creatorId: userId,
    title,
    dimensions: body.dimensions,
    startSurah: body.startSurah,
    startAyah: body.startAyah,
    endSurah: body.endSurah,
    endAyah: body.endAyah,
    startDate: startDate as unknown as FirebaseFirestore.Timestamp,
    endDate: endDate as unknown as FirebaseFirestore.Timestamp,
    totalAyahs,
    allowJoining: body.allowJoining,
  });

  notificationService.notifyJourneyCreated(userId, journey);
  return journey;
}

export async function listByUser(userId: string): Promise<JourneyDetail[]> {
  const journeys = await repo.findByUserId(userId);
  return Promise.all(journeys.map((j) => repo.syncDelayedMembers(j)));
}

export async function getById(id: string): Promise<JourneyDetail> {
  return getDetailOrThrow(id);
}

export async function join(journeyId: string, userId: string): Promise<JourneyDetail> {
  const journey = await getDetailOrThrow(journeyId);

  if (!journey.allowJoining) {
    throw new ForbiddenError('This journey is not open for joining');
  }
  if (!ACTIVE_STATUSES.includes(journey.status)) {
    throw new ForbiddenError('This journey has already ended');
  }
  if (journey.memberIds.includes(userId)) {
    throw new ConflictError('You are already a member of this journey', 'ALREADY_MEMBER');
  }

  const companionship = await companionRepo.findCompanionship(userId, journey.creatorId);
  if (!companionship) {
    throw new ForbiddenError('You must be a companion of the journey creator to join');
  }

  const activeCount = await repo.countActiveByUserId(userId);
  if (activeCount >= MAX_ACTIVE_JOURNEYS) {
    throw new ConflictError(
      `You already have ${MAX_ACTIVE_JOURNEYS} active journeys.`,
      'MAX_ACTIVE_JOURNEYS'
    );
  }

  await repo.addMember(journeyId, userId);

  const updated = (await repo.findDetailById(journeyId))!;
  notificationService.notifyMemberJoined(userId, journey, updated.memberIds);
  return updated;
}

export async function leave(journeyId: string, userId: string): Promise<void> {
  const journey = await getDetailOrThrow(journeyId);
  getMemberOrThrow(journey, userId);

  const remainingMemberIds = journey.memberIds.filter((id) => id !== userId);
  await repo.removeMember(journeyId, userId);
  notificationService.notifyMemberLeft(userId, journey, remainingMemberIds);
}

export async function removeMember(
  journeyId: string,
  requestingUserId: string,
  targetUserId: string
): Promise<JourneyDetail> {
  const journey = await getDetailOrThrow(journeyId);

  if (journey.creatorId !== requestingUserId) {
    throw new ForbiddenError('Only the journey creator can remove members');
  }
  if (targetUserId === requestingUserId) {
    throw new ValidationError('You cannot remove yourself — use leave instead');
  }

  getMemberOrThrow(journey, targetUserId);

  const remainingMemberIds = journey.memberIds.filter((id) => id !== targetUserId);
  await repo.removeMember(journeyId, targetUserId);

  const updated = (await repo.findDetailById(journeyId))!;
  notificationService.notifyMemberRemoved(targetUserId, journey, remainingMemberIds);
  return updated;
}

export async function nudge(
  journeyId: string,
  nudgerUserId: string,
  targetUserId: string
): Promise<void> {
  const journey = await getDetailOrThrow(journeyId);
  getMemberOrThrow(journey, nudgerUserId);
  getMemberOrThrow(journey, targetUserId);

  if (nudgerUserId === targetUserId) {
    throw new ValidationError('You cannot nudge yourself');
  }

  const nudger = await userRepo.findById(nudgerUserId);
  notificationService.notifyNudge(nudger!.name, targetUserId, journey);
}

export async function updateSettings(
  journeyId: string,
  requestingUserId: string,
  body: UpdateJourneySettingsBody
): Promise<JourneyDetail> {
  const journey = await getDetailOrThrow(journeyId);

  if (journey.creatorId !== requestingUserId) {
    throw new ForbiddenError('Only the journey creator can update journey settings');
  }

  await repo.updateJourneySettings(journeyId, body);
  return (await repo.findDetailById(journeyId))!;
}

export async function updateProgress(
  id: string,
  requestingUserId: string,
  body: UpdateProgressBody
): Promise<JourneyDetail> {
  const journey = await getDetailOrThrow(id);
  const member = getMemberOrThrow(journey, requestingUserId);

  if (member.status === 'completed') {
    throw new ConflictError('You have already completed this journey', 'JOURNEY_COMPLETED');
  }
  if (member.status === 'abandoned') {
    throw new ConflictError('You have abandoned this journey', 'JOURNEY_ABANDONED');
  }

  const { surah, ayah } = body;

  if (ayah !== undefined) {
    if (!isValidAyah(surah, ayah)) {
      throw new ValidationError(`Surah ${surah} Ayah ${ayah} does not exist`);
    }
  } else {
    if (!isValidSurah(surah)) {
      throw new ValidationError(`Surah ${surah} does not exist`);
    }
  }

  if (ayah !== undefined) {
    const ayahIdx = toLinearIndex(surah, ayah);
    const startIdx = toLinearIndex(journey.startSurah, journey.startAyah);
    const endIdx = toLinearIndex(journey.endSurah, journey.endAyah);
    if (ayahIdx < startIdx || ayahIdx > endIdx) {
      throw new ValidationError(
        `Surah ${surah} Ayah ${ayah} is outside this journey's range. ` +
        `Create a new journey to cover that range.`
      );
    }
  } else {
    if (surah < journey.startSurah || surah > journey.endSurah) {
      throw new ValidationError(
        `Surah ${surah} is outside this journey's range. ` +
        `Create a new journey to cover that range.`
      );
    }
  }

  const keys =
    ayah !== undefined
      ? [`${surah}_${ayah}`]
      : ayahKeysForSurahInRange(
          surah,
          journey.startSurah,
          journey.startAyah,
          journey.endSurah,
          journey.endAyah
        );

  const newKeys = keys.filter((k) => !member.completedAyahs[k]);
  const newTotal = member.completedCount + newKeys.length;
  let newStatus: JourneyStatus;

  if (newTotal >= journey.totalAyahs) {
    newStatus = 'completed';
  } else if (journey.endDate.seconds * 1000 < Date.now()) {
    newStatus = 'delayed';
  } else {
    newStatus = 'active'; // auto-resume from paused
  }

  const updated = await repo.applyProgress(id, requestingUserId, keys, newStatus);

  if (newStatus === 'completed') {
    notificationService.notifyJourneyCompleted(requestingUserId, updated);
  }

  return updated;
}

export async function updateStatus(
  id: string,
  requestingUserId: string,
  body: UpdateStatusBody
): Promise<JourneyDetail> {
  const journey = await getDetailOrThrow(id);
  const member = getMemberOrThrow(journey, requestingUserId);

  if (member.status === 'completed') {
    throw new ConflictError('Cannot change status of a completed journey', 'JOURNEY_COMPLETED');
  }
  if (member.status === 'abandoned') {
    throw new ConflictError('Cannot change status of an abandoned journey', 'JOURNEY_ABANDONED');
  }
  if (body.status === 'active' && member.status === 'active') {
    throw new ValidationError('Your journey is already active');
  }

  return repo.updateMemberStatus(id, requestingUserId, body.status);
}
