import { z } from 'zod';

export const sendRequestSchema = z.object({
  username: z.string().min(1, 'Username is required'),
});

export const blockUserSchema = z.object({
  username: z.string().min(1, 'Username is required'),
});

export type SendRequestBody = z.infer<typeof sendRequestSchema>;
export type BlockUserBody = z.infer<typeof blockUserSchema>;
