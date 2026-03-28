import request from 'supertest';
import app from '../../src/app';
import { Contribution } from '../../src/types/contribution';

// Mock Firebase Admin SDK before any imports that use it
jest.mock('../../src/config/firebase', () => ({
  auth: {
    verifyIdToken: jest.fn(),
  },
  db: {},
}));

// Mock the entire service layer so integration tests don't need Firestore
jest.mock('../../src/services/contributionService');
jest.mock('../../src/services/userService', () => ({
  upsertUser: jest.fn().mockResolvedValue(undefined),
}));

import * as contributionService from '../../src/services/contributionService';
import { auth } from '../../src/config/firebase';
import { NotFoundError, ConflictError, ForbiddenError } from '../../src/errors';

const mockService = contributionService as jest.Mocked<typeof contributionService>;
const mockAuth = auth as jest.Mocked<typeof auth>;

const fakeContribution: Contribution = {
  id: 'contrib1',
  reciterName: 'Sheikh Sudais',
  surah: 1,
  audioFileId: 'audio123',
  timingFileId: 'timing456',
  audioHash: 'hash789',
  createdBy: 'user1',
  createdAt: {} as FirebaseFirestore.Timestamp,
  status: 'approved',
  downloads: 5,
  likes: 3,
};

const VALID_TOKEN = 'valid-token';

function authHeader() {
  return { Authorization: `Bearer ${VALID_TOKEN}` };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: token verification succeeds
  (mockAuth.verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'user1', name: 'User', email: 'user@test.com' });
});

// ─── GET /health ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ─── GET /contributions ───────────────────────────────────────────────────────

describe('GET /contributions', () => {
  it('returns 400 when surah param is missing', async () => {
    const res = await request(app).get('/contributions');
    expect(res.status).toBe(400);
  });

  it('returns 400 when surah is out of range', async () => {
    const res = await request(app).get('/contributions?surah=0');
    expect(res.status).toBe(400);
  });

  it('returns 200 with contribution list', async () => {
    mockService.listBySurah.mockResolvedValue([fakeContribution]);
    const res = await request(app).get('/contributions?surah=1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('contrib1');
  });
});

// ─── GET /contributions/:id ───────────────────────────────────────────────────

describe('GET /contributions/:id', () => {
  it('returns 200 with the contribution', async () => {
    mockService.getById.mockResolvedValue(fakeContribution);
    const res = await request(app).get('/contributions/contrib1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('contrib1');
  });

  it('returns 404 when not found', async () => {
    mockService.getById.mockRejectedValue(new NotFoundError());
    const res = await request(app).get('/contributions/missing');
    expect(res.status).toBe(404);
  });
});

// ─── POST /contributions ──────────────────────────────────────────────────────

describe('POST /contributions', () => {
  const validBody = {
    reciterName: 'Sheikh Sudais',
    surah: 1,
    audioFileId: 'audio123',
    timingFileId: 'timing456',
    audioHash: 'hash789',
  };

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/contributions').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .post('/contributions')
      .set(authHeader())
      .send({ surah: 200 });
    expect(res.status).toBe(400);
  });

  it('returns 201 on success', async () => {
    mockService.submit.mockResolvedValue(fakeContribution);
    const res = await request(app).post('/contributions').set(authHeader()).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('contrib1');
  });

  it('returns 409 on duplicate hash', async () => {
    mockService.submit.mockRejectedValue(new ConflictError('Duplicate', 'DUPLICATE_HASH'));
    const res = await request(app).post('/contributions').set(authHeader()).send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_HASH');
  });

  it('returns 409 on duplicate reciter+surah', async () => {
    mockService.submit.mockRejectedValue(
      new ConflictError('Duplicate reciter+surah', 'DUPLICATE_RECITER_SURAH')
    );
    const res = await request(app).post('/contributions').set(authHeader()).send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_RECITER_SURAH');
  });
});

// ─── POST /contributions/:id/like ─────────────────────────────────────────────

describe('POST /contributions/:id/like', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/contributions/contrib1/like');
    expect(res.status).toBe(401);
  });

  it('returns 204 on success', async () => {
    mockService.like.mockResolvedValue();
    const res = await request(app).post('/contributions/contrib1/like').set(authHeader());
    expect(res.status).toBe(204);
  });

  it('returns 404 when contribution not found', async () => {
    mockService.like.mockRejectedValue(new NotFoundError());
    const res = await request(app).post('/contributions/missing/like').set(authHeader());
    expect(res.status).toBe(404);
  });
});

// ─── POST /contributions/:id/download ────────────────────────────────────────

describe('POST /contributions/:id/download', () => {
  it('returns 204 on success', async () => {
    mockService.recordDownload.mockResolvedValue();
    const res = await request(app).post('/contributions/contrib1/download').set(authHeader());
    expect(res.status).toBe(204);
  });
});

// ─── DELETE /contributions/:id ────────────────────────────────────────────────

describe('DELETE /contributions/:id', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/contributions/contrib1');
    expect(res.status).toBe(401);
  });

  it('returns 204 on successful delete', async () => {
    mockService.deleteContribution.mockResolvedValue();
    const res = await request(app).delete('/contributions/contrib1').set(authHeader());
    expect(res.status).toBe(204);
  });

  it('returns 403 when not the owner', async () => {
    mockService.deleteContribution.mockRejectedValue(new ForbiddenError());
    const res = await request(app).delete('/contributions/contrib1').set(authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 404 when not found', async () => {
    mockService.deleteContribution.mockRejectedValue(new NotFoundError());
    const res = await request(app).delete('/contributions/missing').set(authHeader());
    expect(res.status).toBe(404);
  });
});
