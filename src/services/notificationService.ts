import { messaging } from '../config/firebase';
import * as userRepo from '../repositories/userRepository';
import { Journey } from '../types/journey';

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

export function notifyJourneyCreated(userId: string, journey: Journey): void {
  sendToUser(
    userId,
    'Journey started!',
    `Your journey "${journey.title}" is ready. Let's begin.`,
    { journeyId: journey.id, type: 'JOURNEY_CREATED' }
  ).catch(() => undefined);
}

export function notifyJourneyCompleted(userId: string, journey: Journey): void {
  sendToUser(
    userId,
    'Journey complete!',
    `You've finished "${journey.title}". Amazing work!`,
    { journeyId: journey.id, type: 'JOURNEY_COMPLETED' }
  ).catch(() => undefined);
}
