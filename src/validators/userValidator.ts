import { z } from 'zod';

/**
 * Username rules:
 * - 3 to 40 characters
 * - Lowercase letters, numbers, underscores, dots, hyphens only
 * - Must start and end with a letter or number
 */
export const usernameSchema = z
  .string()
  .min(3, 'Username must be at least 3 characters')
  .max(40, 'Username must be at most 40 characters')
  .regex(
    /^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$|^[a-z0-9]{3}$/,
    'Username may only contain lowercase letters, numbers, dots, underscores, and hyphens, and must start and end with a letter or number'
  );

export const updateUsernameSchema = z.object({
  username: usernameSchema,
});

export const updateSettingsSchema = z.object({
  allowFriendRequests: z.boolean(),
});

export const updateFcmTokenSchema = z.object({
  fcmToken: z.string().min(1, 'fcmToken is required'),
});

export type UpdateUsernameBody = z.infer<typeof updateUsernameSchema>;
export type UpdateSettingsBody = z.infer<typeof updateSettingsSchema>;
export type UpdateFcmTokenBody = z.infer<typeof updateFcmTokenSchema>;
