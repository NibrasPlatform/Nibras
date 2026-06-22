import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import { Model, Types } from 'mongoose';
import { createE2eApp, getHttpServer } from './setup-e2e-app';
import { User } from '../src/modules/auth/schemas/user.schema';
import { Role } from '../src/modules/rbac/schemas/role.schema';
import { SessionService } from '../src/modules/auth/services/session.service';

interface UserProfileResponse {
  email: string;
  username: string;
  role: string;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let userModel: Model<User>;
  let roleModel: Model<Role>;
  let sessionService: SessionService;

  beforeAll(async () => {
    app = await createE2eApp();
    userModel = app.get(getModelToken(User.name));
    roleModel = app.get(getModelToken(Role.name));
    sessionService = app.get(SessionService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/auth/providers returns provider flags', () => {
    return request(getHttpServer(app))
      .get('/api/auth/providers')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({
          github: false,
          magicLink: false,
        });
      });
  });

  it('GET /api/users/me requires authentication', () => {
    return request(getHttpServer(app)).get('/api/users/me').expect(401);
  });

  it('GET /api/users/me returns profile for valid session', async () => {
    const studentRole = await roleModel.findOne({ name: 'student' }).exec();
    expect(studentRole).toBeTruthy();

    const user = await userModel.create({
      email: 'student@test.edu',
      username: 'student_test',
      displayName: 'Student Test',
      role: studentRole!._id,
      emailVerified: true,
      githubLinked: false,
      reputationScore: 0,
      preferences: {},
    });

    const sessionToken = await sessionService.createSession(
      user._id.toString(),
    );

    await request(getHttpServer(app))
      .get('/api/users/me')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(200)
      .expect((res) => {
        const body = res.body as UserProfileResponse;
        expect(body.email).toBe('student@test.edu');
        expect(body.username).toBe('student_test');
        expect(body.role).toBe('student');
      });
  });

  it('GET /api/users/:id is forbidden for student role', async () => {
    const studentRole = await roleModel.findOne({ name: 'student' }).exec();
    const user = await userModel.create({
      email: 'student2@test.edu',
      username: 'student2_test',
      role: studentRole!._id,
      emailVerified: true,
      githubLinked: false,
      reputationScore: 0,
      preferences: {},
    });

    const sessionToken = await sessionService.createSession(
      user._id.toString(),
    );

    await request(getHttpServer(app))
      .get(`/api/users/${new Types.ObjectId().toString()}`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(403);
  });

  it('POST /api/auth/logout revokes session', async () => {
    const studentRole = await roleModel.findOne({ name: 'student' }).exec();
    const user = await userModel.create({
      email: 'logout@test.edu',
      username: 'logout_test',
      role: studentRole!._id,
      emailVerified: true,
      githubLinked: false,
      reputationScore: 0,
      preferences: {},
    });

    const sessionToken = await sessionService.createSession(
      user._id.toString(),
    );

    await request(getHttpServer(app))
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(204);

    await request(getHttpServer(app))
      .get('/api/users/me')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(401);
  });
});
