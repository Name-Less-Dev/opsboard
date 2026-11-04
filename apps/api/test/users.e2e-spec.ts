import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { LoginResult } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { errorCode } from './error-code';
import { getTestDatabaseUrl } from './test-database';

const PASSWORD = 'senha-de-teste';

describe('GET /users (integração com banco real)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  async function createUser(name: string, email: string, role: 'OPERATOR' | 'SUPERVISOR') {
    const passwordHash = await hash(PASSWORD, 4); // custo baixo só para o teste ser rápido
    const user = await prisma.user.create({ data: { name, email, role, passwordHash } });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { id: user.id, token: (login.body as LoginResult).accessToken };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = app.get(PrismaService);

    // Última barreira antes do TRUNCATE: confere o banco conectado de verdade.
    const [{ name }] = await prisma.$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`;
    expect(name).toBe(new URL(getTestDatabaseUrl()).pathname.slice(1));
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE "WorkOrderEvent", "WorkOrder", "User" CASCADE`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('401 sem token', async () => {
    await request(app.getHttpServer()).get('/users').expect(401).expect(errorCode('UNAUTHORIZED'));
  });

  it('403 para operador', async () => {
    const ana = await createUser('Ana', 'ana@test.dev', 'OPERATOR');
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(403)
      .expect(errorCode('FORBIDDEN'));
  });

  it('200 para supervisor: só id, nome e perfil, em ordem de nome', async () => {
    const carla = await createUser('Carla', 'carla@test.dev', 'SUPERVISOR');
    const bruno = await createUser('Bruno', 'bruno@test.dev', 'OPERATOR');
    const ana = await createUser('Ana', 'ana@test.dev', 'OPERATOR');

    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${carla.token}`)
      .expect(200);

    expect(response.body).toEqual([
      { id: ana.id, name: 'Ana', role: 'OPERATOR' },
      { id: bruno.id, name: 'Bruno', role: 'OPERATOR' },
      { id: carla.id, name: 'Carla', role: 'SUPERVISOR' },
    ]);
    // Lista de permissão: nada além dos três campos, e o hash nunca aparece no texto.
    expect(response.text).not.toMatch(/passwordHash|email|@test\.dev/);
  });

  it('mesmo nome: desempata pelo id, sempre na mesma ordem', async () => {
    const carla = await createUser('Carla', 'carla@test.dev', 'SUPERVISOR');
    const first = await createUser('Ana', 'ana1@test.dev', 'OPERATOR');
    const second = await createUser('Ana', 'ana2@test.dev', 'OPERATOR');

    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${carla.token}`)
      .expect(200);

    const anas = (response.body as { id: string; name: string }[])
      .filter((user) => user.name === 'Ana')
      .map((user) => user.id);
    expect(anas).toEqual([first.id, second.id].sort());
  });
});
