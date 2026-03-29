import * as service from '../../src/services/journeyService';
import * as repo from '../../src/repositories/journeyRepository';
import { Journey } from '../../src/types/journey';
import { ValidationError, ConflictError, ForbiddenError, NotFoundError } from '../../src/errors';

jest.mock('../../src/repositories/journeyRepository');
jest.mock('../../src/config/firebase', () => ({}));

const mockedRepo = repo as jest.Mocked<typeof repo>;

function makeTimestamp(isoString: string): FirebaseFirestore.Timestamp {
  const seconds = Math.floor(new Date(isoString).getTime() / 1000);
  return { seconds, nanoseconds: 0 } as FirebaseFirestore.Timestamp;
}

const futureJourney: Journey = {
  id: 'j1',
  userId: 'user1',
  title: 'Test Journey',
  dimensions: ['read'],
  startSurah: 1,
  startAyah: 1,
  endSurah: 1,
  endAyah: 7,
  startDate: makeTimestamp('2026-01-01T00:00:00Z'),
  endDate: makeTimestamp('2099-12-31T00:00:00Z'),
  status: 'active',
  totalAyahs: 7,
  completedAyahs: {},
  completedCount: 0,
  createdAt: makeTimestamp('2026-01-01T00:00:00Z'),
  updatedAt: makeTimestamp('2026-01-01T00:00:00Z'),
};

const validCreateBody = {
  dimensions: ['read' as const],
  startSurah: 1,
  startAyah: 1,
  endSurah: 1,
  endAyah: 7,
  startDate: '2026-01-01T00:00:00Z',
  endDate: '2099-12-31T00:00:00Z',
};

beforeEach(() => jest.clearAllMocks());

// ─── create ───────────────────────────────────────────────────────────────────

describe('create', () => {
  it('creates a journey with auto-generated title when none provided', async () => {
    mockedRepo.countActiveByUserId.mockResolvedValue(0);
    mockedRepo.create.mockResolvedValue(futureJourney);

    const result = await service.create('user1', validCreateBody);
    expect(result).toEqual(futureJourney);
    expect(mockedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user1', totalAyahs: 7 })
    );
  });

  it('uses provided title', async () => {
    mockedRepo.countActiveByUserId.mockResolvedValue(0);
    mockedRepo.create.mockResolvedValue({ ...futureJourney, title: 'My Journey' });

    await service.create('user1', { ...validCreateBody, title: 'My Journey' });
    expect(mockedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Journey' })
    );
  });

  it('throws ValidationError for non-existent ayah (surah 114 ayah 30)', async () => {
    await expect(
      service.create('user1', { ...validCreateBody, endSurah: 114, endAyah: 30 })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when start is after end', async () => {
    await expect(
      service.create('user1', { ...validCreateBody, startSurah: 2, startAyah: 1, endSurah: 1, endAyah: 7 })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when start equals end', async () => {
    await expect(
      service.create('user1', { ...validCreateBody, startSurah: 1, startAyah: 7, endSurah: 1, endAyah: 7 })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ConflictError when max active journeys reached', async () => {
    mockedRepo.countActiveByUserId.mockResolvedValue(5);
    await expect(service.create('user1', validCreateBody)).rejects.toMatchObject({
      code: 'MAX_ACTIVE_JOURNEYS',
    });
  });

  it('throws ValidationError when startDate >= endDate', async () => {
    await expect(
      service.create('user1', {
        ...validCreateBody,
        startDate: '2099-01-01T00:00:00Z',
        endDate: '2026-01-01T00:00:00Z',
      })
    ).rejects.toThrow(ValidationError);
  });
});

// ─── updateProgress ───────────────────────────────────────────────────────────

describe('updateProgress', () => {
  it('marks a single ayah and returns updated journey', async () => {
    mockedRepo.findById.mockResolvedValue(futureJourney);
    mockedRepo.applyProgress.mockResolvedValue({ ...futureJourney, completedCount: 1, status: 'active' });

    const result = await service.updateProgress('j1', 'user1', { surah: 1, ayah: 1 });
    expect(result.completedCount).toBe(1);
    expect(mockedRepo.applyProgress).toHaveBeenCalledWith('j1', ['1_1'], 'active');
  });

  it('marks all ayahs of a surah when no ayah given', async () => {
    mockedRepo.findById.mockResolvedValue(futureJourney);
    mockedRepo.applyProgress.mockResolvedValue({ ...futureJourney, completedCount: 7, status: 'completed' });

    const result = await service.updateProgress('j1', 'user1', { surah: 1 });
    expect(result.status).toBe('completed');
    expect(mockedRepo.applyProgress).toHaveBeenCalledWith(
      'j1',
      ['1_1', '1_2', '1_3', '1_4', '1_5', '1_6', '1_7'],
      'completed'
    );
  });

  it('auto-completes journey when all ayahs covered', async () => {
    const almostDone = { ...futureJourney, completedCount: 6, completedAyahs: { '1_1': true as true, '1_2': true as true, '1_3': true as true, '1_4': true as true, '1_5': true as true, '1_6': true as true } };
    mockedRepo.findById.mockResolvedValue(almostDone);
    mockedRepo.applyProgress.mockResolvedValue({ ...almostDone, completedCount: 7, status: 'completed' });

    const result = await service.updateProgress('j1', 'user1', { surah: 1, ayah: 7 });
    expect(result.status).toBe('completed');
    expect(mockedRepo.applyProgress).toHaveBeenCalledWith('j1', ['1_7'], 'completed');
  });

  it('throws ForbiddenError when not the owner', async () => {
    mockedRepo.findById.mockResolvedValue(futureJourney);
    await expect(
      service.updateProgress('j1', 'other-user', { surah: 1, ayah: 1 })
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ConflictError on completed journey', async () => {
    mockedRepo.findById.mockResolvedValue({ ...futureJourney, status: 'completed' });
    await expect(
      service.updateProgress('j1', 'user1', { surah: 1, ayah: 1 })
    ).rejects.toMatchObject({ code: 'JOURNEY_COMPLETED' });
  });

  it('throws ValidationError for ayah outside journey range', async () => {
    mockedRepo.findById.mockResolvedValue(futureJourney);
    await expect(
      service.updateProgress('j1', 'user1', { surah: 2, ayah: 1 })
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError for non-existent ayah', async () => {
    mockedRepo.findById.mockResolvedValue({ ...futureJourney, endSurah: 114, endAyah: 6 });
    await expect(
      service.updateProgress('j1', 'user1', { surah: 114, ayah: 30 })
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when journey does not exist', async () => {
    mockedRepo.findById.mockResolvedValue(null);
    await expect(
      service.updateProgress('j1', 'user1', { surah: 1, ayah: 1 })
    ).rejects.toThrow(NotFoundError);
  });
});

// ─── updateStatus ─────────────────────────────────────────────────────────────

describe('updateStatus', () => {
  it('pauses an active journey', async () => {
    mockedRepo.findById.mockResolvedValue(futureJourney);
    mockedRepo.updateStatus.mockResolvedValue();
    const result = await service.updateStatus('j1', 'user1', { status: 'paused' });
    expect(result.status).toBe('paused');
  });

  it('throws ForbiddenError when not owner', async () => {
    mockedRepo.findById.mockResolvedValue(futureJourney);
    await expect(
      service.updateStatus('j1', 'other-user', { status: 'paused' })
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ConflictError when journey is completed', async () => {
    mockedRepo.findById.mockResolvedValue({ ...futureJourney, status: 'completed' });
    await expect(
      service.updateStatus('j1', 'user1', { status: 'paused' })
    ).rejects.toMatchObject({ code: 'JOURNEY_COMPLETED' });
  });
});

// ─── quran data helpers ───────────────────────────────────────────────────────

describe('Quran data', () => {
  const { isValidAyah, countAyahsInRange, AYAH_COUNTS } = require('../../src/data/quran');

  it('validates surah 114 has 6 ayahs', () => {
    expect(isValidAyah(114, 6)).toBe(true);
    expect(isValidAyah(114, 7)).toBe(false);
    expect(AYAH_COUNTS[114]).toBe(6);
  });

  it('validates surah 1 has 7 ayahs', () => {
    expect(isValidAyah(1, 7)).toBe(true);
    expect(isValidAyah(1, 8)).toBe(false);
  });

  it('counts ayahs correctly for single surah range', () => {
    expect(countAyahsInRange(1, 1, 1, 7)).toBe(7);
    expect(countAyahsInRange(1, 3, 1, 7)).toBe(5);
  });

  it('counts ayahs correctly across surahs', () => {
    // Surah 1 (7) full + Surah 2 ayah 1 = 8 total
    expect(countAyahsInRange(1, 1, 2, 1)).toBe(8);
  });

  it('total ayah count for full Quran is 6236', () => {
    expect(countAyahsInRange(1, 1, 114, 6)).toBe(6236);
  });
});
