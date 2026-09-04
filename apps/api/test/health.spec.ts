import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.setup';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { PrismaService } from '../src/prisma/prisma.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase('GET /health with PostgreSQL', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    process.env.DATABASE_URL = testDatabaseUrl;
    const moduleReference = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports ready only after probing the database', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });
});

describe('GET /health when PostgreSQL is unavailable', () => {
  it('returns a sanitized 503 response', async () => {
    const verifyConnection = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('connection details must stay private'));
    const moduleReference = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: PrismaService, useValue: { verifyConnection } },
      ],
    }).compile();
    const app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();

    try {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(503);

      expect(verifyConnection).toHaveBeenCalledOnce();
      expect(response.body).toEqual({
        error: {
          code: 'HTTP_ERROR',
          message: 'The Teamizer API is not ready.',
          requestId: expect.any(String),
        },
      });
      expect(JSON.stringify(response.body)).not.toContain('connection details');
    } finally {
      await app.close();
    }
  });
});

describe('Prisma startup readiness', () => {
  it('fails module initialization when the initial connection fails', async () => {
    const prisma = new PrismaService();
    const connectionError = new Error('PostgreSQL is unavailable');
    const connect = vi
      .spyOn(prisma, '$connect')
      .mockRejectedValue(connectionError);

    await expect(prisma.onModuleInit()).rejects.toBe(connectionError);
    expect(connect).toHaveBeenCalledOnce();
    await prisma.$disconnect();
  });
});
