import { ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:net';
import type { AppModule as AppModuleType } from '../src/app.module';

export async function createE2eApp(): Promise<INestApplication> {
  // Deferred require so test memory servers can set env before ConfigModule loads.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../src/app.module') as {
    AppModule: typeof AppModuleType;
  };

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  return app;
}

export function getHttpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}
