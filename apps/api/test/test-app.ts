import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashSync } from 'bcrypt';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

export const TEST_PASSWORD = 'senha-de-teste';

const passwordHash = hashSync(TEST_PASSWORD, 4); // custo baixo só para o teste ser rápido

export const operator = {
  id: 'operator-id',
  name: 'Ana Operadora',
  email: 'ana@opsboard.dev',
  passwordHash,
  role: 'OPERATOR',
};
export const supervisor = {
  id: 'supervisor-id',
  name: 'Carla Supervisora',
  email: 'carla@opsboard.dev',
  passwordHash,
  role: 'SUPERVISOR',
};

type TestUser = typeof operator;
type FindUniqueArgs = {
  where: { id?: string; email?: string };
  select?: Record<string, boolean>;
};

// Dublê do Prisma que respeita o `select`, como o banco: sem isso, o teste de que o
// passwordHash não vaza não provaria nada.
function findUnique({ where, select }: FindUniqueArgs): Promise<Partial<TestUser> | null> {
  const user = [operator, supervisor].find(
    (candidate) => candidate.id === where.id || candidate.email === where.email,
  );
  if (!user || !select) {
    return Promise.resolve(user ?? null);
  }
  const picked = Object.entries(user).filter(([key]) => select[key]);
  return Promise.resolve(Object.fromEntries(picked) as Partial<TestUser>);
}

// AppModule real (guards, pipe, JWT, bcrypt); só o acesso ao banco é trocado.
export async function createTestApp(controllers: Type[] = []): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  })
    .overrideProvider(PrismaService)
    .useValue({
      user: { findUnique },
      $queryRaw: () => Promise.resolve([]),
      $disconnect: () => Promise.resolve(),
    })
    .compile();

  const app = moduleRef.createNestApplication<INestApplication<App>>();
  await app.init();
  return app;
}
