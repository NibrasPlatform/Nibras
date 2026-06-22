import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { Model } from 'mongoose';
import { createE2eApp, getHttpServer } from './setup-e2e-app';
import { User } from '../src/modules/auth/schemas/user.schema';
import { Role } from '../src/modules/rbac/schemas/role.schema';
import { SessionService } from '../src/modules/auth/services/session.service';

type IdResponse = { id: string };
type EvaluateResponse = {
  testResults: unknown[];
  score: number;
};

describe('Assessments flow (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<User>;
  let roleModel: Model<Role>;
  let sessionService: SessionService;
  let instructorToken: string;
  let studentToken: string;

  beforeAll(async () => {
    process.env.COMPETITIONS_SYNC_ENABLED = 'false';
    process.env.EXECUTOR_ENABLED = 'false';
    app = await createE2eApp();
    userModel = app.get(getModelToken(User.name));
    roleModel = app.get(getModelToken(Role.name));
    sessionService = app.get(SessionService);

    const instructorRole = await roleModel
      .findOne({ name: 'instructor' })
      .exec();
    const studentRole = await roleModel.findOne({ name: 'student' }).exec();
    expect(instructorRole).toBeTruthy();
    expect(studentRole).toBeTruthy();

    const instructor = await userModel.create({
      email: 'instructor-assess@test.edu',
      username: 'instructor_assess',
      displayName: 'Instructor',
      role: instructorRole!._id,
      emailVerified: true,
      githubLinked: false,
      reputationScore: 0,
      preferences: {},
    });

    const student = await userModel.create({
      email: 'student-assess@test.edu',
      username: 'student_assess',
      displayName: 'Student',
      role: studentRole!._id,
      emailVerified: true,
      githubLinked: false,
      reputationScore: 0,
      preferences: {},
    });

    instructorToken = await sessionService.createSession(
      instructor._id.toString(),
    );
    studentToken = await sessionService.createSession(student._id.toString());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates course, assignment, test case, submits and evaluates', async () => {
    const courseRes = await request(getHttpServer(app))
      .post('/api/courses')
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        slug: 'phase6-e2e-course',
        title: 'Phase 6 E2E',
        termLabel: 'Fall 2026',
        courseCode: 'P6E2E',
        isPublic: true,
      })
      .expect(201);

    const courseId = (courseRes.body as IdResponse).id;

    await request(getHttpServer(app))
      .post(`/api/courses/${courseId}/enroll`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({})
      .expect(201);

    const assignmentRes = await request(getHttpServer(app))
      .post(`/api/courses/${courseId}/assignments`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        title: 'Sum Two',
        type: 'code',
        pointsPossible: 100,
        published: true,
      })
      .expect(201);

    const assignmentId = (assignmentRes.body as IdResponse).id;

    await request(getHttpServer(app))
      .post(`/api/assignments/${assignmentId}/test-cases`)
      .set('Authorization', `Bearer ${instructorToken}`)
      .send({
        input: '1 2',
        expectedOutput: '3',
        isHidden: false,
      })
      .expect(201);

    await request(getHttpServer(app))
      .post(`/api/assignments/${assignmentId}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        language: 'javascript',
        code: "function solve(input) { const [a,b] = input.trim().split(' ').map(Number); return a+b; }",
      })
      .expect(201);

    const evalRes = await request(getHttpServer(app))
      .post(`/api/assignments/${assignmentId}/evaluate`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    const evalBody = evalRes.body as EvaluateResponse;
    expect(evalBody.testResults).toBeDefined();
    expect(evalBody.testResults.length).toBeGreaterThan(0);
    expect(evalBody.score).toBe(100);
  });
});
