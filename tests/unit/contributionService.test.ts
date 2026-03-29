import { submit, listBySurah, getById, like, recordDownload, deleteContribution } from '../../src/services/contributionService';
import * as repo from '../../src/repositories/contributionRepository';
import { ConflictError, ForbiddenError, NotFoundError } from '../../src/errors';
import { Contribution } from '../../src/types/contribution';

jest.mock('../../src/repositories/contributionRepository');
jest.mock('../../src/config/firebase', () => ({}));

const mockedRepo = repo as jest.Mocked<typeof repo>;

const baseContribution: Contribution = {
  id: 'contrib1',
  reciterName: 'Sheikh Sudais',
  surah: 1,
  audioFileId: 'audio123',
  timingFileId: 'timing456',
  audioHash: 'hash789',
  createdBy: 'user1',
  createdByName: 'Test User',
  createdAt: {} as FirebaseFirestore.Timestamp,
  status: 'approved',
  downloads: 0,
  likes: 0,
};

const validBody = {
  reciterName: 'Sheikh Sudais',
  surah: 1,
  audioFileId: 'audio123',
  timingFileId: 'timing456',
  audioHash: 'hash789',
  force: false,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('submit', () => {
  it('creates a contribution when no duplicates exist', async () => {
    mockedRepo.findByHash.mockResolvedValue(null);
    mockedRepo.findByReciterAndSurah.mockResolvedValue(null);
    mockedRepo.create.mockResolvedValue(baseContribution);

    const result = await submit('user1', 'Test User', validBody);
    expect(result).toEqual(baseContribution);
    expect(mockedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ reciterName: 'Sheikh Sudais', surah: 1 })
    );
  });

  it('throws ConflictError(DUPLICATE_HASH) when audioHash already exists', async () => {
    mockedRepo.findByHash.mockResolvedValue(baseContribution);

    await expect(submit('user1', 'Test User', validBody)).rejects.toThrow(ConflictError);
    await expect(submit('user1', 'Test User', validBody)).rejects.toMatchObject({ code: 'DUPLICATE_HASH' });
  });

  it('throws ConflictError(DUPLICATE_RECITER_SURAH) when reciter+surah pair exists and force=false', async () => {
    mockedRepo.findByHash.mockResolvedValue(null);
    mockedRepo.findByReciterAndSurah.mockResolvedValue(baseContribution);

    await expect(submit('user1', 'Test User', validBody)).rejects.toMatchObject({ code: 'DUPLICATE_RECITER_SURAH' });
  });

  it('allows submission when force=true even if reciter+surah exists', async () => {
    mockedRepo.findByHash.mockResolvedValue(null);
    mockedRepo.findByReciterAndSurah.mockResolvedValue(baseContribution);
    mockedRepo.create.mockResolvedValue(baseContribution);

    const result = await submit('user1', 'Test User', { ...validBody, force: true });
    expect(result).toEqual(baseContribution);
    expect(mockedRepo.findByReciterAndSurah).not.toHaveBeenCalled();
  });
});

describe('getById', () => {
  it('returns contribution when found', async () => {
    mockedRepo.findById.mockResolvedValue(baseContribution);
    const result = await getById('contrib1');
    expect(result).toEqual(baseContribution);
  });

  it('throws NotFoundError when not found', async () => {
    mockedRepo.findById.mockResolvedValue(null);
    await expect(getById('missing')).rejects.toThrow(NotFoundError);
  });
});

describe('listBySurah', () => {
  it('delegates to repository', async () => {
    mockedRepo.findBySurah.mockResolvedValue([baseContribution]);
    const result = await listBySurah(1);
    expect(result).toEqual([baseContribution]);
    expect(mockedRepo.findBySurah).toHaveBeenCalledWith(1, true);
  });
});

describe('like', () => {
  it('increments likes when contribution exists', async () => {
    mockedRepo.findById.mockResolvedValue(baseContribution);
    mockedRepo.incrementField.mockResolvedValue();
    await like('contrib1');
    expect(mockedRepo.incrementField).toHaveBeenCalledWith('contrib1', 'likes');
  });

  it('throws NotFoundError when contribution does not exist', async () => {
    mockedRepo.findById.mockResolvedValue(null);
    await expect(like('missing')).rejects.toThrow(NotFoundError);
  });
});

describe('recordDownload', () => {
  it('increments downloads when contribution exists', async () => {
    mockedRepo.findById.mockResolvedValue(baseContribution);
    mockedRepo.incrementField.mockResolvedValue();
    await recordDownload('contrib1');
    expect(mockedRepo.incrementField).toHaveBeenCalledWith('contrib1', 'downloads');
  });
});

describe('deleteContribution', () => {
  it('deletes when requester is the owner', async () => {
    mockedRepo.findById.mockResolvedValue(baseContribution);
    mockedRepo.deleteById.mockResolvedValue();
    await deleteContribution('contrib1', 'user1');
    expect(mockedRepo.deleteById).toHaveBeenCalledWith('contrib1');
  });

  it('throws ForbiddenError when requester is not the owner', async () => {
    mockedRepo.findById.mockResolvedValue(baseContribution);
    await expect(deleteContribution('contrib1', 'other-user')).rejects.toThrow(ForbiddenError);
  });

  it('throws NotFoundError when contribution does not exist', async () => {
    mockedRepo.findById.mockResolvedValue(null);
    await expect(deleteContribution('missing', 'user1')).rejects.toThrow(NotFoundError);
  });
});
