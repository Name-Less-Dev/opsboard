import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

// Sobe a aplicação inteira (módulos, rotas), mas troca o Prisma por um dublê:
// este teste não depende de um Postgres rodando.
describe('GET /health (e2e)', () => {
  let app: INestApplication<App>;
  const prisma = { $queryRaw: jest.fn(), $disconnect: jest.fn() };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('200 quando o banco responde', () => {
    prisma.$queryRaw.mockResolvedValue([]);
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', database: 'up' });
  });

  it('503 quando o banco falha', () => {
    prisma.$queryRaw.mockRejectedValue(new Error('down'));
    return request(app.getHttpServer()).get('/health').expect(503);
  });
});
