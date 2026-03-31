import * as companionRepo from '../repositories/companionRepository';
import * as userRepo from '../repositories/userRepository';
import * as journeyRepo from '../repositories/journeyRepository';
import { User, UserProfile } from '../types/user';
import { CompanionRequest, Companionship, Block } from '../types/companion';
import { ACTIVE_STATUSES } from '../types/journey';
import { UpdateUsernameBody, UpdateSettingsBody } from '../validators/userValidator';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors';

// ─── Profile + username ───────────────────────────────────────────────────────

export async function updateUsername(uid: string, body: UpdateUsernameBody): Promise<User> {
  try {
    await userRepo.updateUsername(uid, body.username);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'USERNAME_TAKEN') {
      throw new ConflictError('Username is already taken', 'USERNAME_TAKEN');
    }
    throw err;
  }
  return (await userRepo.findById(uid))!;
}

export async function updateSettings(uid: string, body: UpdateSettingsBody): Promise<User> {
  await userRepo.updateSettings(uid, body);
  return (await userRepo.findById(uid))!;
}

export async function getProfile(username: string, viewerUserId?: string): Promise<UserProfile> {
  const target = await userRepo.findByUsername(username);
  if (!target) throw new NotFoundError(`User "${username}" not found`);

  // Fetch stats in parallel
  const [companionCount, journeys, completedAyahs] = await Promise.all([
    companionRepo.countCompanionships(target.id),
    journeyRepo.findByUserId(target.id),
    journeyRepo.sumCompletedAyahs(target.id),
  ]);

  // Active journeys for this user = journeys where their own member status is active
  const activeJourneys = journeys.filter((j) => {
    const myMember = j.members.find((m) => m.userId === target.id);
    return myMember && ACTIVE_STATUSES.includes(myMember.status);
  });

  const profile: UserProfile = {
    id: target.id,
    name: target.name,
    username: target.username,
    createdAt: target.createdAt,
    stats: { totalCompanions: companionCount, completedAyahs },
  };

  if (viewerUserId && viewerUserId !== target.id) {
    const [companionship, sentReq, receivedReq, blocked] = await Promise.all([
      companionRepo.findCompanionship(viewerUserId, target.id),
      companionRepo.findRequest(viewerUserId, target.id),
      companionRepo.findRequest(target.id, viewerUserId),
      companionRepo.findBlock(viewerUserId, target.id),
    ]);

    const isCompanion = companionship !== null;

    profile.relationship = {
      isCompanion,
      sentRequest: sentReq !== null,
      receivedRequest: receivedReq !== null,
      isBlocked: blocked !== null,
    };

    if (isCompanion) {
      profile.journeys = activeJourneys as unknown[];
    }
  } else if (viewerUserId === target.id) {
    // Viewing own profile — show all active journeys
    profile.journeys = activeJourneys as unknown[];
  }

  return profile;
}

// ─── Companion requests ───────────────────────────────────────────────────────

export async function sendRequest(
  fromUserId: string,
  fromUsername: string,
  targetUsername: string
): Promise<{ companionship?: Companionship; request?: CompanionRequest; autoAccepted: boolean }> {
  if (fromUsername === targetUsername) {
    throw new ValidationError('You cannot send a companion request to yourself');
  }

  const target = await userRepo.findByUsername(targetUsername);
  if (!target) throw new NotFoundError(`User "${targetUsername}" not found`);

  if (!target.allowFriendRequests) {
    throw new ForbiddenError(`${targetUsername} is not accepting companion requests`);
  }

  // Check blocks in either direction
  const blocked = await companionRepo.isBlockedInAnyDirection(fromUserId, target.id);
  if (blocked) throw new ForbiddenError('Unable to send a companion request to this user');

  // Already companions?
  const existing = await companionRepo.findCompanionship(fromUserId, target.id);
  if (existing) throw new ConflictError('You are already companions with this user', 'ALREADY_COMPANIONS');

  // Already sent a request?
  const alreadySent = await companionRepo.findRequest(fromUserId, target.id);
  if (alreadySent) throw new ConflictError('You have already sent a request to this user', 'REQUEST_ALREADY_SENT');

  // Auto-accept: target already sent a request to sender
  const reverseRequest = await companionRepo.findRequest(target.id, fromUserId);
  if (reverseRequest) {
    await Promise.all([
      companionRepo.deleteRequest(reverseRequest.id),
      companionRepo.createCompanionship(fromUserId, target.id),
    ]);
    const companionship = await companionRepo.findCompanionship(fromUserId, target.id);
    return { companionship: companionship!, autoAccepted: true };
  }

  const fromUser = await userRepo.findById(fromUserId);
  const request = await companionRepo.createRequest(
    fromUserId,
    fromUser!.username,
    target.id,
    target.username
  );
  return { request, autoAccepted: false };
}

export async function getIncomingRequests(userId: string): Promise<CompanionRequest[]> {
  return companionRepo.getIncomingRequests(userId);
}

export async function getOutgoingRequests(userId: string): Promise<CompanionRequest[]> {
  return companionRepo.getOutgoingRequests(userId);
}

export async function acceptRequest(requestId: string, userId: string): Promise<Companionship> {
  const request = await companionRepo.findRequestById(requestId);
  if (!request) throw new NotFoundError('Companion request not found');

  if (request.toUserId !== userId) {
    throw new ForbiddenError('You can only accept requests sent to you');
  }

  await Promise.all([
    companionRepo.deleteRequest(requestId),
    companionRepo.createCompanionship(request.fromUserId, request.toUserId),
  ]);

  return (await companionRepo.findCompanionship(request.fromUserId, request.toUserId))!;
}

export async function deleteRequest(requestId: string, userId: string): Promise<void> {
  const request = await companionRepo.findRequestById(requestId);
  if (!request) throw new NotFoundError('Companion request not found');

  // Both sender (cancel) and recipient (reject) may delete
  if (request.fromUserId !== userId && request.toUserId !== userId) {
    throw new ForbiddenError('You do not have permission to remove this request');
  }

  await companionRepo.deleteRequest(requestId);
}

// ─── Companions ───────────────────────────────────────────────────────────────

export async function getCompanions(userId: string): Promise<User[]> {
  const ships = await companionRepo.getCompanionships(userId);
  const companionIds = ships.map((s) => s.userIds.find((id) => id !== userId)!);
  return userRepo.findManyByIds(companionIds);
}

export async function removeCompanion(userId: string, companionUserId: string): Promise<void> {
  const ship = await companionRepo.findCompanionship(userId, companionUserId);
  if (!ship) throw new NotFoundError('Companionship not found');
  await companionRepo.deleteCompanionship(userId, companionUserId);
}

// ─── Blocks ───────────────────────────────────────────────────────────────────

export async function blockUser(
  blockerUserId: string,
  targetUsername: string,
  blockerUsername: string
): Promise<void> {
  if (blockerUsername === targetUsername) {
    throw new ValidationError('You cannot block yourself');
  }

  const target = await userRepo.findByUsername(targetUsername);
  if (!target) throw new NotFoundError(`User "${targetUsername}" not found`);

  const alreadyBlocked = await companionRepo.findBlock(blockerUserId, target.id);
  if (alreadyBlocked) throw new ConflictError('User is already blocked', 'ALREADY_BLOCKED');

  // Remove companionship and all pending requests, then create block
  await Promise.all([
    companionRepo.deleteCompanionship(blockerUserId, target.id),
    companionRepo.deleteAllRequestsBetween(blockerUserId, target.id),
    companionRepo.createBlock(blockerUserId, target.id),
  ]);
}

export async function unblockUser(blockerUserId: string, blockedUserId: string): Promise<void> {
  const block = await companionRepo.findBlock(blockerUserId, blockedUserId);
  if (!block) throw new NotFoundError('Block not found');
  await companionRepo.deleteBlock(blockerUserId, blockedUserId);
}

export async function getBlocks(userId: string): Promise<Block[]> {
  return companionRepo.getBlocks(userId);
}
