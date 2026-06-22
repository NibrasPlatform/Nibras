import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp, getHttpServer } from './setup-e2e-app';

interface PingResponse {
  status: string;
  info: {
    mongo: { status: string };
    redis: { status: string };
  };
}

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/ping returns mongo and redis status', () => {
    return request(getHttpServer(app))
      .get('/api/ping')
      .expect(200)
      .expect((res) => {
        const body = res.body as PingResponse;
        expect(body.status).toBe('ok');
        expect(body.info.mongo.status).toBe('up');
        expect(body.info.redis.status).toBe('up');
      });
  });
});
