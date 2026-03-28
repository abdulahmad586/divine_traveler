import * as repo from '../repositories/contributionRepository';
import { Contribution } from '../types/contribution';
import { PostContributionBody } from '../validators/contributionValidator';
import { ConflictError, ForbiddenError, NotFoundError } from '../errors';

export async function submit(
  userId: string,
  body: PostContributionBody
): Promise<Contribution> {
  const { reciterName, surah, audioFileId, timingFileId, audioHash, force } = body;

  // Hard dedup: reject if exact audio hash already exists
  const existingHash = await repo.findByHash(audioHash);
  if (existingHash) {
    throw new ConflictError(
      'A contribution with this audio file already exists',
      'DUPLICATE_HASH'
    );
  }

  // Soft dedup: warn if same reciter + surah already exists (overridable with force)
  if (!force) {
    const existingReciter = await repo.findByReciterAndSurah(reciterName, surah);
    if (existingReciter) {
      throw new ConflictError(
        `A contribution for "${reciterName}" on surah ${surah} already exists. Submit with force=true to override.`,
        'DUPLICATE_RECITER_SURAH'
      );
    }
  }

  return repo.create({ reciterName, surah, audioFileId, timingFileId, audioHash, createdBy: userId });
}

export async function listBySurah(surah: number): Promise<Contribution[]> {
  return repo.findBySurah(surah);
}

export async function getById(id: string): Promise<Contribution> {
  const contribution = await repo.findById(id);
  if (!contribution) throw new NotFoundError(`Contribution ${id} not found`);
  return contribution;
}

export async function like(id: string): Promise<void> {
  // Ensure the contribution exists before incrementing
  await getById(id);
  await repo.incrementField(id, 'likes');
}

export async function recordDownload(id: string): Promise<void> {
  await getById(id);
  await repo.incrementField(id, 'downloads');
}

export async function deleteContribution(id: string, requestingUserId: string): Promise<void> {
  const contribution = await getById(id);
  if (contribution.createdBy !== requestingUserId) {
    throw new ForbiddenError('You can only delete your own contributions');
  }
  await repo.deleteById(id);
}
