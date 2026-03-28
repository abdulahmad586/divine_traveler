import { z } from 'zod';

export const postContributionSchema = z.object({
  reciterName: z.string().min(1, 'reciterName must not be empty'),
  surah: z
    .number({ error: 'surah must be a number' })
    .int()
    .min(1, 'surah must be between 1 and 114')
    .max(114, 'surah must be between 1 and 114'),
  audioFileId: z.string().min(1, 'audioFileId must not be empty'),
  timingFileId: z.string().min(1, 'timingFileId must not be empty'),
  audioHash: z.string().min(1, 'audioHash must not be empty'),
  force: z.boolean().optional().default(false),
});

export type PostContributionBody = z.infer<typeof postContributionSchema>;
