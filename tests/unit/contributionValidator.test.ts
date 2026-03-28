import { postContributionSchema } from '../../src/validators/contributionValidator';

const validBody = {
  reciterName: 'Sheikh Sudais',
  surah: 1,
  audioFileId: 'abc123',
  timingFileId: 'def456',
  audioHash: 'sha256hash',
};

describe('postContributionSchema', () => {
  it('accepts a valid body', () => {
    const result = postContributionSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it('defaults force to false when omitted', () => {
    const result = postContributionSchema.safeParse(validBody);
    expect(result.success && result.data.force).toBe(false);
  });

  it('accepts force=true', () => {
    const result = postContributionSchema.safeParse({ ...validBody, force: true });
    expect(result.success && result.data.force).toBe(true);
  });

  it.each([0, 115, -1, 200])('rejects surah=%i (out of range)', (surah) => {
    const result = postContributionSchema.safeParse({ ...validBody, surah });
    expect(result.success).toBe(false);
  });

  it.each([1, 114])('accepts boundary surah=%i', (surah) => {
    const result = postContributionSchema.safeParse({ ...validBody, surah });
    expect(result.success).toBe(true);
  });

  it('rejects empty reciterName', () => {
    const result = postContributionSchema.safeParse({ ...validBody, reciterName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty audioFileId', () => {
    const result = postContributionSchema.safeParse({ ...validBody, audioFileId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty timingFileId', () => {
    const result = postContributionSchema.safeParse({ ...validBody, timingFileId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty audioHash', () => {
    const result = postContributionSchema.safeParse({ ...validBody, audioHash: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = postContributionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
