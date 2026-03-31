import * as service from '../../src/services/journeyService';
import * as repo from '../../src/repositories/journeyRepository';
import * as companionRepo from '../../src/repositories/companionRepository';
import * as userRepo from '../../src/repositories/userRepository';
import { JourneyDetail, JourneyMember } from '../../src/types/journey';
import { ValidationError, ConflictError, ForbiddenError, NotFoundError } from '../../src/errors';

jest.mock('../../src/repositories/journeyRepository');
jest.mock('../../src/repositories/companionRepository');
jest.mock('../../src/repositories/userRepository');
jest.mock('../../src/config/firebase', () => ({}));

const mockedRepo = repo as jest.Mocked<typeof repo>;
const mockedCompanionRepo = companionRepo as jest.Mocked<typeof companionRepo>;
const mockedUserRepo = userRepo as jest.Mocked<typeof userRepo>;

function makeTimestamp(isoString: string): FirebaseFirestore.Timestamp {
  const seconds = Math.floor(new Date(isoString).getTime() / 1000);
  return { seconds, nanoseconds: 0 } as FirebaseFirestore.Timestamp;
}

const ts = makeTimestamp('2026-01-01T00:00:00Z');
const futurTs = makeTimestamp('2099-12-31T00:00:00Z');

function makeMember(overrides: Partial<JourneyMember> = {}): JourneyMember {
  return {
    userId: 'user1',
    status: 'active',
    completedAyahs: {},
    completedCount: 0,
    joinedAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function makeJourney(overrides: Partial<JourneyDetail> = {}): JourneyDetail {
  return {
    id: 'j1',
    creatorId: 'user1',
    title: 'Test Journey',
    dimensions: ['read'],
    startSurah: 1,
    startAyah: 1,
    endSurah: 1,
    endAyah: 7,
    startDate: ts,
    endDate: futurTs,
    status: 'active',
    totalAyahs: 7,
    allowJoining: false,
    memberIds: ['user1'],
    memberCount: 1,
    members: [makeMember()],
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

const validCreateBody = {
  dimensions: ['read' as const],
  startSurah: 1,
  startAyah: 1,
  endSurah: 1,
  endAyah: 7,
  startDate: '2026-01-01T00:00:00Z',
  endDate: '2099-12-31T00:00:00Z',
  allowJoining: false,
};

beforeEach(() => jest.clearAllMocks());

// ─── create ───────────────────────────────────────────────────────────────────

describe('create', () => {
  it('creates a journey with auto-generated title when none provided', async () => {
    const journey = makeJourney();
    mockedRepo.countActiveByUserId.mockResolvedValue(0);
    mockedRepo.create.mockResolvedValue(journey);

    const result = await service.create('user1', validCreateBody);
    expect(result).toEqual(journey);
    expect(mockedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ creatorId: 'user1', totalAyahs: 7, allowJoining: false })
    );
  });

  it('uses provided title', async () => {
    mockedRepo.countActiveByUserId.mockResolvedValue(0);
    mockedRepo.create.mockResolvedValue(makeJourney({ title: 'My Journey' }));

    await service.create('user1', { ...validCreateBody, title: 'My Journey' });
    expect(mockedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Journey' })
    );
  });

  it('passes allowJoining flag', async () => {
    mockedRepo.countActiveByUserId.mockResolvedValue(0);
    mockedRepo.create.mockResolvedValue(makeJourney({ allowJoining: true }));

    await service.create('user1', { ...validCreateBody, allowJoining: true });
    expect(mockedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ allowJoining: true })
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

// ─── join ─────────────────────────────────────────────────────────────────────

describe('join', () => {
  it('throws ForbiddenError when allowJoining is false', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney({ allowJoining: false }));
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(service.join('j1', 'user2')).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when journey has ended', async () => {
    mockedRepo.findDetailById.mockResolvedValue(
      makeJourney({ allowJoining: true, status: 'completed' })
    );
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(service.join('j1', 'user2')).rejects.toThrow(ForbiddenError);
  });

  it('throws ConflictError when already a member', async () => {
    mockedRepo.findDetailById.mockResolvedValue(
      makeJourney({ allowJoining: true, memberIds: ['user1', 'user2'], members: [makeMember(), makeMember({ userId: 'user2' })] })
    );
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(service.join('j1', 'user2')).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ForbiddenError when not a companion of creator', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney({ allowJoining: true }));
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    mockedCompanionRepo.findCompanionship.mockResolvedValue(null);
    await expect(service.join('j1', 'user2')).rejects.toThrow(ForbiddenError);
  });

  it('throws ConflictError when joiner is at max active journeys', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney({ allowJoining: true }));
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    mockedCompanionRepo.findCompanionship.mockResolvedValue({ id: 'ship1', userIds: ['user1', 'user2'], createdAt: ts });
    mockedRepo.countActiveByUserId.mockResolvedValue(5);
    await expect(service.join('j1', 'user2')).rejects.toMatchObject({ code: 'MAX_ACTIVE_JOURNEYS' });
  });

  it('adds member and returns updated journey', async () => {
    const journey = makeJourney({ allowJoining: true });
    const updated = makeJourney({ memberIds: ['user1', 'user2'], memberCount: 2, members: [makeMember(), makeMember({ userId: 'user2' })] });
    mockedRepo.findDetailById
      .mockResolvedValueOnce(journey)  // initial fetch
      .mockResolvedValueOnce(updated); // after add
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    mockedCompanionRepo.findCompanionship.mockResolvedValue({ id: 'ship1', userIds: ['user1', 'user2'], createdAt: ts });
    mockedRepo.countActiveByUserId.mockResolvedValue(0);
    mockedRepo.addMember.mockResolvedValue(undefined);

    const result = await service.join('j1', 'user2');
    expect(result.memberCount).toBe(2);
    expect(mockedRepo.addMember).toHaveBeenCalledWith('j1', 'user2');
  });
});

// ─── leave ────────────────────────────────────────────────────────────────────

describe('leave', () => {
  it('throws ForbiddenError when not a member', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(service.leave('j1', 'user2')).rejects.toThrow(ForbiddenError);
  });

  it('removes member successfully', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    mockedRepo.removeMember.mockResolvedValue(undefined);
    await service.leave('j1', 'user1');
    expect(mockedRepo.removeMember).toHaveBeenCalledWith('j1', 'user1');
  });
});

// ─── removeMember ─────────────────────────────────────────────────────────────

describe('removeMember', () => {
  it('throws ForbiddenError when not the creator', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(service.removeMember('j1', 'user2', 'user3')).rejects.toThrow(ForbiddenError);
  });

  it('throws ValidationError when creator tries to remove themselves', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(service.removeMember('j1', 'user1', 'user1')).rejects.toThrow(ValidationError);
  });

  it('throws ForbiddenError when target is not a member', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(service.removeMember('j1', 'user1', 'nonmember')).rejects.toThrow(ForbiddenError);
  });

  it('removes target member and returns updated journey', async () => {
    const journey = makeJourney({
      memberIds: ['user1', 'user2'],
      members: [makeMember(), makeMember({ userId: 'user2' })],
    });
    const updated = makeJourney();
    mockedRepo.findDetailById
      .mockResolvedValueOnce(journey)
      .mockResolvedValueOnce(updated);
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    mockedRepo.removeMember.mockResolvedValue(undefined);

    await service.removeMember('j1', 'user1', 'user2');
    expect(mockedRepo.removeMember).toHaveBeenCalledWith('j1', 'user2');
  });
});

// ─── nudge ────────────────────────────────────────────────────────────────────

describe('nudge', () => {
  it('throws ForbiddenError when nudger is not a member', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(service.nudge('j1', 'nonmember', 'user1')).rejects.toThrow(ForbiddenError);
  });

  it('throws ForbiddenError when target is not a member', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(service.nudge('j1', 'user1', 'nonmember')).rejects.toThrow(ForbiddenError);
  });

  it('throws ValidationError when nudging yourself', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(service.nudge('j1', 'user1', 'user1')).rejects.toThrow(ValidationError);
  });

  it('sends nudge to target member', async () => {
    const journey = makeJourney({
      memberIds: ['user1', 'user2'],
      members: [makeMember(), makeMember({ userId: 'user2' })],
    });
    mockedRepo.findDetailById.mockResolvedValue(journey);
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    mockedUserRepo.findById.mockResolvedValue({
      id: 'user1', name: 'Alice', email: 'alice@example.com',
      username: 'alice', allowFriendRequests: true,
      createdAt: ts, updatedAt: ts,
    });

    await service.nudge('j1', 'user1', 'user2');
    expect(mockedUserRepo.findById).toHaveBeenCalledWith('user1');
  });
});

// ─── updateProgress ───────────────────────────────────────────────────────────

describe('updateProgress', () => {
  it('marks a single ayah and returns updated journey', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    mockedRepo.applyProgress.mockResolvedValue(makeJourney({ status: 'active', members: [makeMember({ completedCount: 1 })] }));

    const result = await service.updateProgress('j1', 'user1', { surah: 1, ayah: 1 });
    expect(mockedRepo.applyProgress).toHaveBeenCalledWith('j1', 'user1', ['1_1'], 'active');
    expect(result.members[0].completedCount).toBe(1);
  });

  it('marks all ayahs of a surah when no ayah given', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    mockedRepo.applyProgress.mockResolvedValue(makeJourney({ status: 'completed', members: [makeMember({ completedCount: 7, status: 'completed' })] }));

    const result = await service.updateProgress('j1', 'user1', { surah: 1 });
    expect(result.members[0].status).toBe('completed');
    expect(mockedRepo.applyProgress).toHaveBeenCalledWith(
      'j1', 'user1',
      ['1_1', '1_2', '1_3', '1_4', '1_5', '1_6', '1_7'],
      'completed'
    );
  });

  it('auto-completes when all ayahs covered', async () => {
    const almostDone = makeJourney({
      members: [makeMember({
        completedCount: 6,
        completedAyahs: { '1_1': true, '1_2': true, '1_3': true, '1_4': true, '1_5': true, '1_6': true } as Record<string, true>,
      })],
    });
    mockedRepo.findDetailById.mockResolvedValue(almostDone);
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    mockedRepo.applyProgress.mockResolvedValue(makeJourney({ status: 'completed', members: [makeMember({ completedCount: 7, status: 'completed' })] }));

    const result = await service.updateProgress('j1', 'user1', { surah: 1, ayah: 7 });
    expect(result.members[0].status).toBe('completed');
    expect(mockedRepo.applyProgress).toHaveBeenCalledWith('j1', 'user1', ['1_7'], 'completed');
  });

  it('throws ForbiddenError when not a member', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(
      service.updateProgress('j1', 'other-user', { surah: 1, ayah: 1 })
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ConflictError on member-completed journey', async () => {
    mockedRepo.findDetailById.mockResolvedValue(
      makeJourney({ members: [makeMember({ status: 'completed' })] })
    );
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(
      service.updateProgress('j1', 'user1', { surah: 1, ayah: 1 })
    ).rejects.toMatchObject({ code: 'JOURNEY_COMPLETED' });
  });

  it('throws ValidationError for ayah outside journey range', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(
      service.updateProgress('j1', 'user1', { surah: 2, ayah: 1 })
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when journey does not exist', async () => {
    mockedRepo.findDetailById.mockResolvedValue(null);
    await expect(
      service.updateProgress('j1', 'user1', { surah: 1, ayah: 1 })
    ).rejects.toThrow(NotFoundError);
  });
});

// ─── updateStatus ─────────────────────────────────────────────────────────────

describe('updateStatus', () => {
  it('pauses a member in an active journey', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    mockedRepo.updateMemberStatus.mockResolvedValue(
      makeJourney({ status: 'paused', members: [makeMember({ status: 'paused' })] })
    );
    const result = await service.updateStatus('j1', 'user1', { status: 'paused' });
    expect(result.members[0].status).toBe('paused');
    expect(mockedRepo.updateMemberStatus).toHaveBeenCalledWith('j1', 'user1', 'paused');
  });

  it('throws ForbiddenError when not a member', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(
      service.updateStatus('j1', 'other-user', { status: 'paused' })
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ConflictError when member status is completed', async () => {
    mockedRepo.findDetailById.mockResolvedValue(
      makeJourney({ members: [makeMember({ status: 'completed' })] })
    );
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(
      service.updateStatus('j1', 'user1', { status: 'paused' })
    ).rejects.toMatchObject({ code: 'JOURNEY_COMPLETED' });
  });
});

// ─── updateSettings ───────────────────────────────────────────────────────────

describe('updateSettings', () => {
  it('throws ForbiddenError when not the creator', async () => {
    mockedRepo.findDetailById.mockResolvedValue(makeJourney());
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    await expect(
      service.updateSettings('j1', 'other-user', { allowJoining: true })
    ).rejects.toThrow(ForbiddenError);
  });

  it('updates allowJoining when called by creator', async () => {
    mockedRepo.findDetailById
      .mockResolvedValueOnce(makeJourney())
      .mockResolvedValueOnce(makeJourney({ allowJoining: true }));
    mockedRepo.syncDelayedMembers.mockImplementation(async (j) => j);
    mockedRepo.updateJourneySettings.mockResolvedValue(undefined);

    const result = await service.updateSettings('j1', 'user1', { allowJoining: true });
    expect(mockedRepo.updateJourneySettings).toHaveBeenCalledWith('j1', { allowJoining: true });
    expect(result.allowJoining).toBe(true);
  });
});

// ─── computeAggregateStatus ───────────────────────────────────────────────────

describe('computeAggregateStatus', () => {
  const { computeAggregateStatus } = jest.requireActual('../../src/repositories/journeyRepository');

  it('returns active when any member is active', () => {
    expect(computeAggregateStatus(['active', 'paused', 'completed'])).toBe('active');
  });

  it('returns delayed when any member is delayed (no active)', () => {
    expect(computeAggregateStatus(['delayed', 'paused', 'completed'])).toBe('delayed');
  });

  it('returns paused when all remaining are paused', () => {
    expect(computeAggregateStatus(['paused', 'paused'])).toBe('paused');
  });

  it('returns completed when all members are completed', () => {
    expect(computeAggregateStatus(['completed', 'completed'])).toBe('completed');
  });

  it('returns abandoned when all members are abandoned', () => {
    expect(computeAggregateStatus(['abandoned', 'abandoned'])).toBe('abandoned');
  });

  it('returns abandoned for empty member list', () => {
    expect(computeAggregateStatus([])).toBe('abandoned');
  });

  it('mix of completed and abandoned returns completed (best state)', () => {
    expect(computeAggregateStatus(['completed', 'abandoned'])).toBe('completed');
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
    expect(countAyahsInRange(1, 1, 2, 1)).toBe(8);
  });

  it('total ayah count for full Quran is 6236', () => {
    expect(countAyahsInRange(1, 1, 114, 6)).toBe(6236);
  });
});
