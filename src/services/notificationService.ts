import { messaging } from '../config/firebase';
import * as userRepo from '../repositories/userRepository';
import { Journey } from '../types/journey';

// ─── Core send helpers ────────────────────────────────────────────────────────

async function sendToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  const user = await userRepo.findById(userId);
  if (!user?.fcmToken) return;

  try {
    await messaging.send({
      token: user.fcmToken,
      notification: { title, body },
      data,
    });
  } catch {
    // Silently ignore FCM errors (invalid token, unregistered device, etc.)
  }
}

async function sendToMany(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (userIds.length === 0) return;
  const users = await userRepo.findManyByIds(userIds);
  const tokens = users.map((u) => u.fcmToken).filter((t): t is string => !!t);
  if (tokens.length === 0) return;

  try {
    await messaging.sendEachForMulticast({ tokens, notification: { title, body }, data });
  } catch {
    // Silently ignore
  }
}

// ─── Journey notifications ────────────────────────────────────────────────────

export function notifyJourneyCreated(userId: string, journey: Journey): void {
  sendToUser(
    userId,
    'Your journey has begun',
    `The path of "${journey.title}" awaits you. Take the first step.`,
    { journeyId: journey.id, type: 'JOURNEY_CREATED' }
  ).catch(() => undefined);
}

export function notifyJourneyCompleted(userId: string, journey: Journey): void {
  sendToUser(
    userId,
    'A journey fulfilled',
    `You have completed "${journey.title}". May your efforts be accepted.`,
    { journeyId: journey.id, type: 'JOURNEY_COMPLETED' }
  ).catch(() => undefined);
}

// ─── Group journey notifications ──────────────────────────────────────────────

export function notifyMemberJoined(
  joinerUserId: string,
  journey: Journey,
  allMemberIds: string[]
): void {
  const recipients = allMemberIds.filter((id) => id !== joinerUserId);
  sendToMany(
    recipients,
    'A new traveler joins the path',
    `A companion has joined "${journey.title}". May your steps be blessed together.`,
    { journeyId: journey.id, type: 'MEMBER_JOINED' }
  ).catch(() => undefined);
}

export function notifyMemberLeft(
  leaverUserId: string,
  journey: Journey,
  remainingMemberIds: string[]
): void {
  sendToMany(
    remainingMemberIds,
    'A traveler has parted ways',
    `A companion has departed from "${journey.title}". Continue your journey with steadfastness.`,
    { journeyId: journey.id, type: 'MEMBER_LEFT' }
  ).catch(() => undefined);

  // Notify the one who left
  sendToUser(
    leaverUserId,
    'You have left the path',
    `You have departed from "${journey.title}". May you find your way again.`,
    { journeyId: journey.id, type: 'MEMBER_LEFT' }
  ).catch(() => undefined);
}

export function notifyMemberRemoved(
  removedUserId: string,
  journey: Journey,
  remainingMemberIds: string[]
): void {
  // Notify the removed person
  sendToUser(
    removedUserId,
    'Your path has diverged',
    `You have been removed from "${journey.title}". Seek new journeys and let not your heart be burdened.`,
    { journeyId: journey.id, type: 'MEMBER_REMOVED' }
  ).catch(() => undefined);

  // Notify remaining members
  sendToMany(
    remainingMemberIds,
    'A traveler has departed',
    `A companion has been removed from "${journey.title}". Press on with resolve.`,
    { journeyId: journey.id, type: 'MEMBER_REMOVED' }
  ).catch(() => undefined);
}

export function notifyNudge(
  nudgerName: string,
  targetUserId: string,
  journey: Journey
): void {
  sendToUser(
    targetUserId,
    `${nudgerName} calls you back to the path`,
    `Your companion awaits you on "${journey.title}". Return when your heart is ready.`,
    { journeyId: journey.id, type: 'NUDGE' }
  ).catch(() => undefined);
}
