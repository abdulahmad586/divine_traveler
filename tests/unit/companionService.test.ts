import * as service from '../../src/services/companionService';
import * as companionRepo from '../../src/repositories/companionRepository';
import * as userRepo from '../../src/repositories/userRepository';
import * as journeyRepo from '../../src/repositories/journeyRepository';
import { User } from '../../src/types/user';
import { CompanionRequest, Companionship, Block } from '../../src/types/companion';
import { JourneyDetail, JourneyMember } from '../../src/types/journey';
import {
  ValidationError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../src/errors';

jest.mock('../../src/repositories/companionRepository');
jest.mock('../../src/repositories/userRepository');
jest.mock('../../src/repositories/journeyRepository');
jest.mock('../../src/config/firebase', () => ({}));

const mockedCompanionRepo = companionRepo as jest.Mocked<typeof companionRepo>;
const mockedUserRepo = userRepo as jest.Mocked<typeof userRepo>;
const mockedJourneyRepo = journeyRepo as jest.Mocked<typeof journeyRepo>;

function makeTimestamp(isoString: string): FirebaseFirestore.Timestamp {
  const seconds = Math.floor(new Date(isoString).getTime() / 1000);
  return { seconds, nanoseconds: 0 } as FirebaseFirestore.Timestamp;
}

const ts = makeTimestamp('2026-01-01T00:00:00Z');

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user1',
    name: 'Alice',
    email: 'alice@example.com',
    username: 'alice',
    allowFriendRequests: true,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<CompanionRequest> = {}): CompanionRequest {
  return {
    id: 'req1',
    fromUserId: 'user1',
    fromUsername: 'alice',
    toUserId: 'user2',
    toUsername: 'bob',
    createdAt: ts,
    ...overrides,
  };
}

function makeCompanionship(overrides: Partial<Companionship> = {}): Companionship {
  return {
    id: 'ship1',
    userIds: ['user1', 'user2'],
    createdAt: ts,
    ...overrides,
  };
}

function makeJourney(overrides: Partial<JourneyDetail> = {}): JourneyDetail {
  const member: JourneyMember = {
    userId: 'user1',
    status: 'active',
    completedAyahs: {},
    completedCount: 0,
    joinedAt: ts,
    updatedAt: ts,
  };
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
    endDate: makeTimestamp('2099-12-31T00:00:00Z'),
    status: 'active',
    totalAyahs: 7,
    allowJoining: false,
    memberIds: ['user1'],
    memberCount: 1,
    members: [member],
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

// ─── sendRequest ──────────────────────────────────────────────────────────────

describe('sendRequest', () => {
  it('throws ValidationError when sending to yourself', async () => {
    await expect(
      service.sendRequest('user1', 'alice', 'alice')
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError when target does not exist', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(null);
    await expect(
      service.sendRequest('user1', 'alice', 'bob')
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when target does not accept requests', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(
      makeUser({ id: 'user2', username: 'bob', allowFriendRequests: false })
    );
    await expect(
      service.sendRequest('user1', 'alice', 'bob')
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ForbiddenError when blocked', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(
      makeUser({ id: 'user2', username: 'bob' })
    );
    mockedCompanionRepo.isBlockedInAnyDirection.mockResolvedValue(true);
    await expect(
      service.sendRequest('user1', 'alice', 'bob')
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ConflictError when already companions', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(
      makeUser({ id: 'user2', username: 'bob' })
    );
    mockedCompanionRepo.isBlockedInAnyDirection.mockResolvedValue(false);
    mockedCompanionRepo.findCompanionship.mockResolvedValue(makeCompanionship());
    await expect(
      service.sendRequest('user1', 'alice', 'bob')
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError when request already sent', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(
      makeUser({ id: 'user2', username: 'bob' })
    );
    mockedCompanionRepo.isBlockedInAnyDirection.mockResolvedValue(false);
    mockedCompanionRepo.findCompanionship.mockResolvedValue(null);
    mockedCompanionRepo.findRequest.mockResolvedValueOnce(makeRequest()); // alreadySent
    await expect(
      service.sendRequest('user1', 'alice', 'bob')
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('auto-accepts when reverse request exists', async () => {
    const bob = makeUser({ id: 'user2', username: 'bob' });
    mockedUserRepo.findByUsername.mockResolvedValue(bob);
    mockedCompanionRepo.isBlockedInAnyDirection.mockResolvedValue(false);
    mockedCompanionRepo.findCompanionship
      .mockResolvedValueOnce(null)  // not already companions
      .mockResolvedValueOnce(makeCompanionship()); // after creation
    mockedCompanionRepo.findRequest
      .mockResolvedValueOnce(null)      // alreadySent check
      .mockResolvedValueOnce(makeRequest({ fromUserId: 'user2', toUserId: 'user1' })); // reverseRequest
    mockedCompanionRepo.deleteRequest.mockResolvedValue(undefined);
    mockedCompanionRepo.createCompanionship.mockResolvedValue(undefined);

    const result = await service.sendRequest('user1', 'alice', 'bob');

    expect(result.autoAccepted).toBe(true);
    expect(result.companionship).toBeDefined();
    expect(mockedCompanionRepo.createCompanionship).toHaveBeenCalledWith('user1', 'user2');
  });

  it('creates a new request when no reverse exists', async () => {
    const bob = makeUser({ id: 'user2', username: 'bob' });
    mockedUserRepo.findByUsername.mockResolvedValue(bob);
    mockedCompanionRepo.isBlockedInAnyDirection.mockResolvedValue(false);
    mockedCompanionRepo.findCompanionship.mockResolvedValue(null);
    mockedCompanionRepo.findRequest.mockResolvedValue(null);
    mockedUserRepo.findById.mockResolvedValue(makeUser());
    const newRequest = makeRequest();
    mockedCompanionRepo.createRequest.mockResolvedValue(newRequest);

    const result = await service.sendRequest('user1', 'alice', 'bob');

    expect(result.autoAccepted).toBe(false);
    expect(result.request).toEqual(newRequest);
  });
});

// ─── acceptRequest ────────────────────────────────────────────────────────────

describe('acceptRequest', () => {
  it('throws NotFoundError when request not found', async () => {
    mockedCompanionRepo.findRequestById.mockResolvedValue(null);
    await expect(service.acceptRequest('req1', 'user2')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when user is not the recipient', async () => {
    mockedCompanionRepo.findRequestById.mockResolvedValue(makeRequest());
    await expect(service.acceptRequest('req1', 'user1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('creates companionship and deletes request', async () => {
    mockedCompanionRepo.findRequestById.mockResolvedValue(makeRequest());
    mockedCompanionRepo.deleteRequest.mockResolvedValue(undefined);
    mockedCompanionRepo.createCompanionship.mockResolvedValue(undefined);
    mockedCompanionRepo.findCompanionship.mockResolvedValue(makeCompanionship());

    const result = await service.acceptRequest('req1', 'user2');

    expect(result).toEqual(makeCompanionship());
    expect(mockedCompanionRepo.deleteRequest).toHaveBeenCalledWith('req1');
    expect(mockedCompanionRepo.createCompanionship).toHaveBeenCalledWith('user1', 'user2');
  });
});

// ─── deleteRequest ────────────────────────────────────────────────────────────

describe('deleteRequest', () => {
  it('throws NotFoundError when request not found', async () => {
    mockedCompanionRepo.findRequestById.mockResolvedValue(null);
    await expect(service.deleteRequest('req1', 'user1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when user is neither sender nor recipient', async () => {
    mockedCompanionRepo.findRequestById.mockResolvedValue(makeRequest());
    await expect(service.deleteRequest('req1', 'user3')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows sender to cancel', async () => {
    mockedCompanionRepo.findRequestById.mockResolvedValue(makeRequest());
    mockedCompanionRepo.deleteRequest.mockResolvedValue(undefined);
    await service.deleteRequest('req1', 'user1');
    expect(mockedCompanionRepo.deleteRequest).toHaveBeenCalledWith('req1');
  });

  it('allows recipient to reject', async () => {
    mockedCompanionRepo.findRequestById.mockResolvedValue(makeRequest());
    mockedCompanionRepo.deleteRequest.mockResolvedValue(undefined);
    await service.deleteRequest('req1', 'user2');
    expect(mockedCompanionRepo.deleteRequest).toHaveBeenCalledWith('req1');
  });
});

// ─── removeCompanion ──────────────────────────────────────────────────────────

describe('removeCompanion', () => {
  it('throws NotFoundError when companionship not found', async () => {
    mockedCompanionRepo.findCompanionship.mockResolvedValue(null);
    await expect(service.removeCompanion('user1', 'user2')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('removes existing companionship', async () => {
    mockedCompanionRepo.findCompanionship.mockResolvedValue(makeCompanionship());
    mockedCompanionRepo.deleteCompanionship.mockResolvedValue(undefined);
    await service.removeCompanion('user1', 'user2');
    expect(mockedCompanionRepo.deleteCompanionship).toHaveBeenCalledWith('user1', 'user2');
  });
});

// ─── blockUser ────────────────────────────────────────────────────────────────

describe('blockUser', () => {
  it('throws ValidationError when blocking yourself', async () => {
    await expect(
      service.blockUser('user1', 'alice', 'alice')
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError when target not found', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(null);
    await expect(
      service.blockUser('user1', 'bob', 'alice')
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ConflictError when already blocked', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(makeUser({ id: 'user2', username: 'bob' }));
    mockedCompanionRepo.findBlock.mockResolvedValue({
      id: 'block1',
      blockerUserId: 'user1',
      blockedUserId: 'user2',
      createdAt: ts,
    } as Block);
    await expect(
      service.blockUser('user1', 'bob', 'alice')
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('removes companionship and requests then creates block', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(makeUser({ id: 'user2', username: 'bob' }));
    mockedCompanionRepo.findBlock.mockResolvedValue(null);
    mockedCompanionRepo.deleteCompanionship.mockResolvedValue(undefined);
    mockedCompanionRepo.deleteAllRequestsBetween.mockResolvedValue(undefined);
    mockedCompanionRepo.createBlock.mockResolvedValue(undefined);

    await service.blockUser('user1', 'bob', 'alice');

    expect(mockedCompanionRepo.deleteCompanionship).toHaveBeenCalledWith('user1', 'user2');
    expect(mockedCompanionRepo.deleteAllRequestsBetween).toHaveBeenCalledWith('user1', 'user2');
    expect(mockedCompanionRepo.createBlock).toHaveBeenCalledWith('user1', 'user2');
  });
});

// ─── unblockUser ─────────────────────────────────────────────────────────────

describe('unblockUser', () => {
  it('throws NotFoundError when block not found', async () => {
    mockedCompanionRepo.findBlock.mockResolvedValue(null);
    await expect(service.unblockUser('user1', 'user2')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes existing block', async () => {
    mockedCompanionRepo.findBlock.mockResolvedValue({
      id: 'block1',
      blockerUserId: 'user1',
      blockedUserId: 'user2',
      createdAt: ts,
    } as Block);
    mockedCompanionRepo.deleteBlock.mockResolvedValue(undefined);
    await service.unblockUser('user1', 'user2');
    expect(mockedCompanionRepo.deleteBlock).toHaveBeenCalledWith('user1', 'user2');
  });
});

// ─── getProfile ───────────────────────────────────────────────────────────────

describe('getProfile', () => {
  it('throws NotFoundError when user not found', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(null);
    await expect(service.getProfile('ghost')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns public profile without relationship when no viewer', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(makeUser());
    mockedCompanionRepo.countCompanionships.mockResolvedValue(3);
    mockedJourneyRepo.findByUserId.mockResolvedValue([makeJourney()]);
    mockedJourneyRepo.sumCompletedAyahs.mockResolvedValue(42);

    const profile = await service.getProfile('alice');

    expect(profile.id).toBe('user1');
    expect(profile.stats.totalCompanions).toBe(3);
    expect(profile.stats.completedAyahs).toBe(42);
    expect(profile.relationship).toBeUndefined();
    expect(profile.journeys).toBeUndefined();
  });

  it('includes own journeys when viewing own profile', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(makeUser());
    mockedCompanionRepo.countCompanionships.mockResolvedValue(0);
    mockedJourneyRepo.findByUserId.mockResolvedValue([makeJourney()]);
    mockedJourneyRepo.sumCompletedAyahs.mockResolvedValue(0);

    const profile = await service.getProfile('alice', 'user1');

    expect(profile.journeys).toHaveLength(1);
    expect(profile.relationship).toBeUndefined();
  });

  it('includes relationship context for a different viewer', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(makeUser());
    mockedCompanionRepo.countCompanionships.mockResolvedValue(0);
    mockedJourneyRepo.findByUserId.mockResolvedValue([]);
    mockedJourneyRepo.sumCompletedAyahs.mockResolvedValue(0);
    mockedCompanionRepo.findCompanionship.mockResolvedValue(null);
    mockedCompanionRepo.findRequest
      .mockResolvedValueOnce(null)    // sentReq
      .mockResolvedValueOnce(null);   // receivedReq
    mockedCompanionRepo.findBlock.mockResolvedValue(null);

    const profile = await service.getProfile('alice', 'user2');

    expect(profile.relationship).toEqual({
      isCompanion: false,
      sentRequest: false,
      receivedRequest: false,
      isBlocked: false,
    });
    expect(profile.journeys).toBeUndefined();
  });

  it('includes journeys when viewer is a companion', async () => {
    mockedUserRepo.findByUsername.mockResolvedValue(makeUser());
    mockedCompanionRepo.countCompanionships.mockResolvedValue(1);
    mockedJourneyRepo.findByUserId.mockResolvedValue([makeJourney()]);
    mockedJourneyRepo.sumCompletedAyahs.mockResolvedValue(0);
    mockedCompanionRepo.findCompanionship.mockResolvedValue(makeCompanionship());
    mockedCompanionRepo.findRequest
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockedCompanionRepo.findBlock.mockResolvedValue(null);

    const profile = await service.getProfile('alice', 'user2');

    expect(profile.relationship!.isCompanion).toBe(true);
    expect(profile.journeys).toHaveLength(1);
  });
});
