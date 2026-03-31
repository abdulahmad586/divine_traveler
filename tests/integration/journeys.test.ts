import request from 'supertest';
import app from '../../src/app';
import { JourneyDetail, JourneyMember } from '../../src/types/journey';

jest.mock('../../src/config/firebase', () => ({
  auth: { verifyIdToken: jest.fn() },
  db: {},
  messaging: {},
}));

jest.mock('../../src/services/journeyService');
jest.mock('../../src/services/userService', () => ({
  upsertUser: jest.fn().mockResolvedValue(undefined),
}));

import * as journeyService from '../../src/services/journeyService';
import { auth } from '../../src/config/firebase';
import { NotFoundError, ConflictError, ForbiddenError, ValidationError } from '../../src/errors';

const mockService = journeyService as jest.Mocked<typeof journeyService>;
const mockAuth = auth as jest.Mocked<typeof auth>;

const ts = { seconds: 1743184800, nanoseconds: 0 } as FirebaseFirestore.Timestamp;
const futurTs = { seconds: 4102444800, nanoseconds: 0 } as FirebaseFirestore.Timestamp;

function makeMember(overrides: Partial<JourneyMember> = {}): JourneyMember {
  return {
    userId: 'user1',
    status: 'active',
    completedAyahs: {},
    completedCount: 0,
    joinedAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function makeJourney(overrides: Partial<JourneyDetail> = {}): JourneyDetail {
  return {
    id: 'j1',
    creatorId: 'user1',
    title: 'Read: Al-Fatiha',
    dimensions: ['read'],
    startSurah: 1,
    startAyah: 1,
    endSurah: 1,
    endAyah: 7,
    startDate: ts,
    endDate: futurTs,
    status: 'active',
    totalAyahs: 7,
    allowJoining: false,
    memberIds: ['user1'],
    memberCount: 1,
    members: [makeMember()],
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

const VALID_TOKEN = 'valid-token';
function authHeader() {
  return { Authorization: `Bearer ${VALID_TOKEN}` };
}

beforeEach(() => {
  jest.clearAllMocks();
  (mockAuth.verifyIdToken as jest.Mock).mockResolvedValue({
    uid: 'user1',
    name: 'Alice',
    email: 'alice@example.com',
  });
});

// ─── POST /journeys ───────────────────────────────────────────────────────────

describe('POST /journeys', () => {
  const validBody = {
    dimensions: ['read'],
    startSurah: 1, startAyah: 1,
    endSurah: 1, endAyah: 7,
    startDate: '2026-04-01T00:00:00Z',
    endDate: '2099-12-31T00:00:00Z',
  };

  it('returns 401 without auth', async () => {
    const res = await request(app).post('/journeys').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing dimensions', async () => {
    const res = await request(app).post('/journeys').set(authHeader())
      .send({ ...validBody, dimensions: undefined });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid surah range', async () => {
    const res = await request(app).post('/journeys').set(authHeader())
      .send({ ...validBody, startSurah: 200 });
    expect(res.status).toBe(400);
  });

  it('returns 201 with JourneyDetail on success', async () => {
    mockService.create.mockResolvedValue(makeJourney());
    const res = await request(app).post('/journeys').set(authHeader()).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('j1');
    expect(res.body.creatorId).toBe('user1');
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].userId).toBe('user1');
  });

  it('returns 201 with allowJoining flag', async () => {
    mockService.create.mockResolvedValue(makeJourney({ allowJoining: true }));
    const res = await request(app).post('/journeys').set(authHeader())
      .send({ ...validBody, allowJoining: true });
    expect(res.status).toBe(201);
    expect(res.body.allowJoining).toBe(true);
  });

  it('returns 409 MAX_ACTIVE_JOURNEYS when cap reached', async () => {
    mockService.create.mockRejectedValue(
      new ConflictError('Too many journeys', 'MAX_ACTIVE_JOURNEYS')
    );
    const res = await request(app).post('/journeys').set(authHeader()).send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MAX_ACTIVE_JOURNEYS');
  });
});

// ─── GET /journeys ────────────────────────────────────────────────────────────

describe('GET /journeys', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/journeys');
    expect(res.status).toBe(401);
  });

  it('returns 200 with journey list', async () => {
    mockService.listByUser.mockResolvedValue([makeJourney(), makeJourney({ id: 'j2' })]);
    const res = await request(app).get('/journeys').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].members).toBeDefined();
  });
});

// ─── GET /journeys/:id ────────────────────────────────────────────────────────

describe('GET /journeys/:id', () => {
  it('returns 200 with full JourneyDetail (no auth required)', async () => {
    mockService.getById.mockResolvedValue(makeJourney());
    const res = await request(app).get('/journeys/j1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('j1');
    expect(res.body.creatorId).toBe('user1');
    expect(Array.isArray(res.body.members)).toBe(true);
  });

  it('returns 404 when journey not found', async () => {
    mockService.getById.mockRejectedValue(new NotFoundError('Journey j1 not found'));
    const res = await request(app).get('/journeys/j1');
    expect(res.status).toBe(404);
  });
});

// ─── POST /journeys/:id/progress ─────────────────────────────────────────────

describe('POST /journeys/:id/progress', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/journeys/j1/progress').send({ surah: 1, ayah: 1 });
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing surah', async () => {
    const res = await request(app).post('/journeys/j1/progress').set(authHeader()).send({});
    expect(res.status).toBe(400);
  });

  it('returns 200 with updated JourneyDetail', async () => {
    const updated = makeJourney({ members: [makeMember({ completedCount: 1 })] });
    mockService.updateProgress.mockResolvedValue(updated);
    const res = await request(app).post('/journeys/j1/progress')
      .set(authHeader()).send({ surah: 1, ayah: 1 });
    expect(res.status).toBe(200);
    expect(res.body.members[0].completedCount).toBe(1);
  });

  it('returns 403 when not a member', async () => {
    mockService.updateProgress.mockRejectedValue(new ForbiddenError('Not a member'));
    const res = await request(app).post('/journeys/j1/progress')
      .set(authHeader()).send({ surah: 1, ayah: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 409 JOURNEY_COMPLETED when already done', async () => {
    mockService.updateProgress.mockRejectedValue(
      new ConflictError('Already completed', 'JOURNEY_COMPLETED')
    );
    const res = await request(app).post('/journeys/j1/progress')
      .set(authHeader()).send({ surah: 1, ayah: 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('JOURNEY_COMPLETED');
  });
});

// ─── PATCH /journeys/:id/status ───────────────────────────────────────────────

describe('PATCH /journeys/:id/status', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).patch('/journeys/j1/status').send({ status: 'paused' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid status value', async () => {
    const res = await request(app).patch('/journeys/j1/status')
      .set(authHeader()).send({ status: 'flying' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for system-managed status (completed)', async () => {
    const res = await request(app).patch('/journeys/j1/status')
      .set(authHeader()).send({ status: 'completed' });
    expect(res.status).toBe(400);
  });

  it('returns 200 with updated journey', async () => {
    mockService.updateStatus.mockResolvedValue(
      makeJourney({ status: 'paused', members: [makeMember({ status: 'paused' })] })
    );
    const res = await request(app).patch('/journeys/j1/status')
      .set(authHeader()).send({ status: 'paused' });
    expect(res.status).toBe(200);
    expect(res.body.members[0].status).toBe('paused');
  });

  it('returns 403 when not a member', async () => {
    mockService.updateStatus.mockRejectedValue(new ForbiddenError('Not a member'));
    const res = await request(app).patch('/journeys/j1/status')
      .set(authHeader()).send({ status: 'paused' });
    expect(res.status).toBe(403);
  });
});

// ─── PATCH /journeys/:id/settings ─────────────────────────────────────────────

describe('PATCH /journeys/:id/settings', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).patch('/journeys/j1/settings').send({ allowJoining: true });
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing allowJoining field', async () => {
    const res = await request(app).patch('/journeys/j1/settings').set(authHeader()).send({});
    expect(res.status).toBe(400);
  });

  it('returns 200 with updated journey', async () => {
    mockService.updateSettings.mockResolvedValue(makeJourney({ allowJoining: true }));
    const res = await request(app).patch('/journeys/j1/settings')
      .set(authHeader()).send({ allowJoining: true });
    expect(res.status).toBe(200);
    expect(res.body.allowJoining).toBe(true);
  });

  it('returns 403 when not the creator', async () => {
    mockService.updateSettings.mockRejectedValue(new ForbiddenError('Only creator can update'));
    const res = await request(app).patch('/journeys/j1/settings')
      .set(authHeader()).send({ allowJoining: true });
    expect(res.status).toBe(403);
  });
});

// ─── POST /journeys/:id/join ──────────────────────────────────────────────────

describe('POST /journeys/:id/join', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/journeys/j1/join');
    expect(res.status).toBe(401);
  });

  it('returns 200 with updated journey on success', async () => {
    const joined = makeJourney({
      memberIds: ['user1', 'user2'],
      memberCount: 2,
      members: [makeMember(), makeMember({ userId: 'user2' })],
    });
    mockService.join.mockResolvedValue(joined);
    const res = await request(app).post('/journeys/j1/join').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.memberCount).toBe(2);
    expect(res.body.members).toHaveLength(2);
  });

  it('returns 403 when not a companion of creator', async () => {
    mockService.join.mockRejectedValue(new ForbiddenError('Must be companion of creator'));
    const res = await request(app).post('/journeys/j1/join').set(authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 403 when allowJoining is false', async () => {
    mockService.join.mockRejectedValue(new ForbiddenError('Journey not open for joining'));
    const res = await request(app).post('/journeys/j1/join').set(authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 409 ALREADY_MEMBER when already joined', async () => {
    mockService.join.mockRejectedValue(new ConflictError('Already a member', 'ALREADY_MEMBER'));
    const res = await request(app).post('/journeys/j1/join').set(authHeader());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_MEMBER');
  });

  it('returns 409 MAX_ACTIVE_JOURNEYS when cap reached', async () => {
    mockService.join.mockRejectedValue(
      new ConflictError('Too many journeys', 'MAX_ACTIVE_JOURNEYS')
    );
    const res = await request(app).post('/journeys/j1/join').set(authHeader());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MAX_ACTIVE_JOURNEYS');
  });
});

// ─── DELETE /journeys/:id/leave ───────────────────────────────────────────────

describe('DELETE /journeys/:id/leave', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/journeys/j1/leave');
    expect(res.status).toBe(401);
  });

  it('returns 204 on success', async () => {
    mockService.leave.mockResolvedValue(undefined);
    const res = await request(app).delete('/journeys/j1/leave').set(authHeader());
    expect(res.status).toBe(204);
  });

  it('returns 403 when not a member', async () => {
    mockService.leave.mockRejectedValue(new ForbiddenError('Not a member'));
    const res = await request(app).delete('/journeys/j1/leave').set(authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 404 when journey not found', async () => {
    mockService.leave.mockRejectedValue(new NotFoundError('Journey not found'));
    const res = await request(app).delete('/journeys/j1/leave').set(authHeader());
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /journeys/:id/members/:memberId ───────────────────────────────────

describe('DELETE /journeys/:id/members/:memberId', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).delete('/journeys/j1/members/user2');
    expect(res.status).toBe(401);
  });

  it('returns 200 with updated journey on success', async () => {
    mockService.removeMember.mockResolvedValue(makeJourney());
    const res = await request(app).delete('/journeys/j1/members/user2').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('j1');
  });

  it('returns 403 when not the creator', async () => {
    mockService.removeMember.mockRejectedValue(new ForbiddenError('Only creator can remove'));
    const res = await request(app).delete('/journeys/j1/members/user2').set(authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 400 when creator tries to remove themselves', async () => {
    mockService.removeMember.mockRejectedValue(
      new ValidationError('Cannot remove yourself')
    );
    const res = await request(app).delete('/journeys/j1/members/user1').set(authHeader());
    expect(res.status).toBe(400);
  });
});

// ─── POST /journeys/:id/members/:memberId/nudge ───────────────────────────────

describe('POST /journeys/:id/members/:memberId/nudge', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/journeys/j1/members/user2/nudge');
    expect(res.status).toBe(401);
  });

  it('returns 204 on success', async () => {
    mockService.nudge.mockResolvedValue(undefined);
    const res = await request(app).post('/journeys/j1/members/user2/nudge').set(authHeader());
    expect(res.status).toBe(204);
  });

  it('returns 403 when nudger is not a member', async () => {
    mockService.nudge.mockRejectedValue(new ForbiddenError('Not a member'));
    const res = await request(app).post('/journeys/j1/members/user2/nudge').set(authHeader());
    expect(res.status).toBe(403);
  });

  it('returns 400 when nudging yourself', async () => {
    mockService.nudge.mockRejectedValue(new ValidationError('Cannot nudge yourself'));
    const res = await request(app).post('/journeys/j1/members/user1/nudge').set(authHeader());
    expect(res.status).toBe(400);
  });
});
