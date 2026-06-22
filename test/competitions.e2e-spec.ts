import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, getHttpServer } from './setup-e2e-app';

describe('Competitions (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.COMPETITIONS_SYNC_ENABLED = 'false';
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/contests returns array', () => {
    return request(getHttpServer(app))
      .get('/api/contests')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  it('GET /api/integrations/platforms requires auth', () => {
    return request(getHttpServer(app))
      .get('/api/integrations/platforms')
      .expect(401);
  });

  it('GET /api/ranking requires auth', () => {
    return request(getHttpServer(app)).get('/api/ranking').expect(401);
  });

  it('GET /api/contests/accounts requires auth', () => {
    return request(getHttpServer(app))
      .get('/api/contests/accounts')
      .expect(401);
  });
});
