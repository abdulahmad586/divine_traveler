import * as repo from '../repositories/journeyRepository';
import {
  Journey,
  JourneyStatus,
  MAX_ACTIVE_JOURNEYS,
} from '../types/journey';
import { CreateJourneyBody, UpdateProgressBody, UpdateStatusBody } from '../validators/journeyValidator';
import {
  isValidAyah,
  isValidSurah,
  toLinearIndex,
  countAyahsInRange,
  ayahKeysForSurahInRange,
  formatRange,
} from '../data/quran';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isDelayed(journey: Journey): boolean {
  const endMs = journey.endDate.seconds * 1000;
  return Date.now() > endMs;
}

function resolveStatus(journey: Journey): JourneyStatus {
  if (journey.status === 'completed' || journey.status === 'abandoned') {
    return journey.status;
  }
  if (isDelayed(journey)) return 'delayed';
  return journey.status === 'paused' ? 'paused' : 'active';
}

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

// ─── Service functions ────────────────────────────────────────────────────────

export async function create(userId: string, body: CreateJourneyBody): Promise<Journey> {
  // Validate ayah references
  if (!isValidSurah(body.startSurah) || !isValidAyah(body.startSurah, body.startAyah)) {
    throw new ValidationError(
      `Surah ${body.startSurah} Ayah ${body.startAyah} does not exist`
    );
  }
  if (!isValidSurah(body.endSurah) || !isValidAyah(body.endSurah, body.endAyah)) {
    throw new ValidationError(
      `Surah ${body.endSurah} Ayah ${body.endAyah} does not exist`
    );
  }

  // Validate range order
  const startIdx = toLinearIndex(body.startSurah, body.startAyah);
  const endIdx = toLinearIndex(body.endSurah, body.endAyah);
  if (startIdx >= endIdx) {
    throw new ValidationError('Start position must come before end position');
  }

  // Validate date range
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  if (startDate >= endDate) {
    throw new ValidationError('startDate must be before endDate');
  }

  // Enforce active journey cap
  const activeCount = await repo.countActiveByUserId(userId);
  if (activeCount >= MAX_ACTIVE_JOURNEYS) {
    throw new ConflictError(
      `You already have ${MAX_ACTIVE_JOURNEYS} active journeys. Complete or abandon one before creating a new one.`,
      'MAX_ACTIVE_JOURNEYS'
    );
  }

  const title = body.title?.trim() || generateTitle(body);
  const totalAyahs = countAyahsInRange(body.startSurah, body.startAyah, body.endSurah, body.endAyah);

  return repo.create({
    userId,
    title,
    dimensions: body.dimensions,
    startSurah: body.startSurah,
    startAyah: body.startAyah,
    endSurah: body.endSurah,
    endAyah: body.endAyah,
    startDate: startDate as unknown as FirebaseFirestore.Timestamp,
    endDate: endDate as unknown as FirebaseFirestore.Timestamp,
    totalAyahs,
  });
}

export async function listByUser(userId: string): Promise<Journey[]> {
  const journeys = await repo.findByUserId(userId);
  // Lazily sync delayed status
  return Promise.all(journeys.map((j) => syncDelayed(j)));
}

export async function getById(id: string): Promise<Journey> {
  const journey = await repo.findById(id);
  if (!journey) throw new NotFoundError(`Journey ${id} not found`);
  return syncDelayed(journey);
}

export async function updateProgress(
  id: string,
  requestingUserId: string,
  body: UpdateProgressBody
): Promise<Journey> {
  const journey = await getById(id);

  if (journey.userId !== requestingUserId) {
    throw new ForbiddenError('You can only update progress on your own journeys');
  }
  if (journey.status === 'completed') {
    throw new ConflictError('This journey is already completed', 'JOURNEY_COMPLETED');
  }
  if (journey.status === 'abandoned') {
    throw new ConflictError('This journey has been abandoned', 'JOURNEY_ABANDONED');
  }

  const { surah, ayah } = body;

  // Validate the ayah/surah reference
  if (ayah !== undefined) {
    if (!isValidAyah(surah, ayah)) {
      throw new ValidationError(`Surah ${surah} Ayah ${ayah} does not exist`);
    }
  } else {
    if (!isValidSurah(surah)) {
      throw new ValidationError(`Surah ${surah} does not exist`);
    }
  }

  // Validate the ayah is within the journey range
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
    // Marking a full surah — the surah must overlap with the journey range
    if (surah < journey.startSurah || surah > journey.endSurah) {
      throw new ValidationError(
        `Surah ${surah} is outside this journey's range. ` +
        `Create a new journey to cover that range.`
      );
    }
  }

  // Collect ayah keys to mark
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

  // Determine new status
  const currentCompleted = journey.completedCount;
  const newKeys = keys.filter((k) => !journey.completedAyahs[k]);
  const newTotal = currentCompleted + newKeys.length;
  let newStatus: JourneyStatus;

  if (newTotal >= journey.totalAyahs) {
    newStatus = 'completed';
  } else if (isDelayed(journey)) {
    newStatus = 'delayed';
  } else {
    newStatus = 'active'; // auto-resume from paused
  }

  return repo.applyProgress(id, keys, newStatus);
}

export async function updateStatus(
  id: string,
  requestingUserId: string,
  body: UpdateStatusBody
): Promise<Journey> {
  const journey = await getById(id);

  if (journey.userId !== requestingUserId) {
    throw new ForbiddenError('You can only update your own journeys');
  }
  if (journey.status === 'completed') {
    throw new ConflictError('Cannot change status of a completed journey', 'JOURNEY_COMPLETED');
  }
  if (journey.status === 'abandoned') {
    throw new ConflictError('Cannot change status of an abandoned journey', 'JOURNEY_ABANDONED');
  }
  // Cannot manually set to completed or delayed
  if (body.status === 'active' && journey.status === 'active') {
    throw new ValidationError('Journey is already active');
  }

  await repo.updateStatus(id, body.status);
  return { ...journey, status: body.status };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function syncDelayed(journey: Journey): Promise<Journey> {
  if (
    (journey.status === 'active' || journey.status === 'paused') &&
    isDelayed(journey)
  ) {
    await repo.updateStatus(journey.id, 'delayed');
    return { ...journey, status: 'delayed' };
  }
  return journey;
}
