import * as journeyRepo from '../repositories/journeyRepository';
import * as companionRepo from '../repositories/companionRepository';
import * as userRepo from '../repositories/userRepository';

/**
 * Permanently deletes a user account and all associated data.
 *
 * Execution order:
 *   1. Journey memberships — solo journeys deleted, group journeys left cleanly
 *   2. Companion requests (sent + received)
 *   3. Companionships
 *   4. Blocks (sent + received)
 *   5. User document + username lookup
 *   6. Firebase Auth record (last — allows retries with a valid token if earlier steps fail)
 *
 * Contributions are intentionally left intact. They are public community data
 * and may reference Google Drive files that persist independently.
 */
export async function deleteAccount(userId: string): Promise<void> {
  // 1. Journey memberships
  const journeys = await journeyRepo.findByUserId(userId);

  await Promise.all(
    journeys.map((journey) =>
      journey.memberCount === 1
        ? journeyRepo.deleteJourney(journey.id)
        : journeyRepo.removeMember(journey.id, userId)
    )
  );

  // 2–4. Social graph
  await Promise.all([
    companionRepo.deleteAllRequestsForUser(userId),
    companionRepo.deleteAllCompanionshipsForUser(userId),
    companionRepo.deleteAllBlocksForUser(userId),
  ]);

  // 5–6. User record + Auth (auth last)
  await userRepo.deleteUser(userId);
}
