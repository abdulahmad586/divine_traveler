import { z } from 'zod';

export const createJourneySchema = z.object({
  title: z.string().min(1).optional(),
  dimensions: z
    .array(z.enum(['read', 'memorize', 'translate', 'commentary']))
    .min(1, 'At least one dimension is required')
    .refine((dims) => new Set(dims).size === dims.length, 'Dimensions must be unique'),
  startSurah: z.number().int().min(1).max(114),
  startAyah: z.number().int().min(1),
  endSurah: z.number().int().min(1).max(114),
  endAyah: z.number().int().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  allowJoining: z.boolean().optional().default(false),
});

export type CreateJourneyBody = z.infer<typeof createJourneySchema>;

export const updateProgressSchema = z.object({
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).optional(), // omit to mark entire surah
});

export type UpdateProgressBody = z.infer<typeof updateProgressSchema>;

export const updateStatusSchema = z.object({
  status: z.enum(['active', 'paused', 'abandoned']),
});

export const updateJourneySettingsSchema = z.object({
  allowJoining: z.boolean(),
});

export type UpdateStatusBody = z.infer<typeof updateStatusSchema>;
export type UpdateJourneySettingsBody = z.infer<typeof updateJourneySettingsSchema>;
