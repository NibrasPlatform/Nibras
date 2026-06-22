import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { Model } from 'mongoose';
import { createE2eApp, getHttpServer } from './setup-e2e-app';
import { User } from '../src/modules/auth/schemas/user.schema';
import { Role } from '../src/modules/rbac/schemas/role.schema';
import { SessionService } from '../src/modules/auth/services/session.service';
import { Problem } from '../src/modules/competitions/schemas/problem.schema';

type IdResponse = { id: string };
type SubmissionResponse = { status: string };
type ContestDetailResponse = { standings: unknown[] };

describe('Internal contest flow (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<User>;
  let roleModel: Model<Role>;
  let problemModel: Model<Problem>;
  let sessionService: SessionService;
  let instructorToken: string;

  beforeAll(async () => {
    process.env.COMPETITIONS_SYNC_ENABLED = 'false';
    app = await createE2eApp();
    userModel = app.get(getModelToken(User.name));
    roleModel = app.get(getModelToken(Role.name));
    problemModel = app.get(getModelToken(Problem.name));
    sessionService = app.get(SessionService);

    const instructorRole = await roleModel
      .findOne({ name: 'instructor' })
      .exec();
    expect(instructorRole).toBeTruthy();

    const instructor = await userModel.create({
      email: 'instructor-contest@test.edu',
      username: 'instructor_contest',
      displayName: 'Instructor',
      role: instructorRole!._id,
      emailVerified: true,
      githubLinked: false,
      reputationScore: 0,
      preferences: {},
    });

    instructorToken = await sessionService.createSession(
      instructor._id.toString(),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates problem, contest, registers, and submits solution', async () => {
    const problemRes = await request(getHttpServer(app))
      .post('/api/problems')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        title: 'Sum Two',
        description: 'Return a+b',
        difficulty: 800,
        testCases: [
          { input: '1 2', expectedOutput: '3', isSample: true },
          { input: '2 3', expectedOutput: '5', isSample: false },
        ],
        sampleIO: [{ input: '1 2', output: '3' }],
      })
      .expect(201);

    const problemId = (problemRes.body as IdResponse).id;

    const start = new Date(Date.now() - 60_000).toISOString();
    const end = new Date(Date.now() + 3600_000).toISOString();

    const contestRes = await request(getHttpServer(app))
      .post('/api/contests')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        name: 'E2E Internal Contest',
        startDate: start,
        endDate: end,
        problemIds: [problemId],
      })
      .expect(201);

    const contestId = (contestRes.body as IdResponse).id;

    await request(getHttpServer(app))
      .post(`/api/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .expect(201);

    const submitRes = await request(getHttpServer(app))
      .post(`/api/contests/${contestId}/submissions`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        problemId,
        language: 'javascript',
        code: 'function solve(input) { const [a,b]=input.trim().split(" ").map(Number); return a+b; }',
      })
      .expect(201);

    expect((submitRes.body as SubmissionResponse).status).toBeDefined();

    const detail = await request(getHttpServer(app))
      .get(`/api/contests/${contestId}`)
      .expect(200);

    const detailBody = detail.body as ContestDetailResponse;
    expect(detailBody.standings).toBeDefined();
    expect(Array.isArray(detailBody.standings)).toBe(true);

    await problemModel.deleteOne({ _id: problemId }).exec();
  });
});
