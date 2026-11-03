import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { LoginResult } from './../src/auth/auth.service';
import { Clock } from './../src/clock/clock';
import type { Prisma } from './../src/generated/prisma/client';
import { PrismaService } from './../src/prisma/prisma.service';
import { getTestDatabaseUrl } from './test-database';
import { errorCode } from './error-code';

type OrderJson = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string;
  assignee: { id: string; name: string } | null;
};
type PageJson = {
  items: OrderJson[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
type SummaryJson = {
  byStatus: Record<'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED', number>;
  overdue: { count: number; items: OrderJson[] };
  generatedAt: string;
};

// "Agora" fixo para a suíte inteira: o Clock real é trocado por este.
const NOW = new Date('2026-06-15T12:00:00.000Z');
const DAY_MS = 86_400_000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY_MS);

describe('Listagem e painel (integração com banco real)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let supervisorId: string;
  let ana: { id: string; token: string };
  let bruno: { id: string; token: string };
  let sequence = 0;

  async function createUser(name: string, email: string, role: 'OPERATOR' | 'SUPERVISOR') {
    const passwordHash = await hash('senha-de-teste', 4); // custo baixo só para o teste ser rápido
    const user = await prisma.user.create({ data: { name, email, role, passwordHash } });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'senha-de-teste' })
      .expect(200);
    return { id: user.id, token: (login.body as LoginResult).accessToken };
  }

  // Insere direto no banco: pela API não dá para criar ordem com prazo no passado.
  // createdAt crescente por padrão, para a ordem da lista ser previsível.
  async function insert(data: Partial<Prisma.WorkOrderUncheckedCreateInput> = {}) {
    sequence += 1;
    return prisma.workOrder.create({
      data: {
        title: `Ordem ${sequence}`,
        priority: 'MEDIUM',
        status: 'OPEN',
        dueDate: at(10),
        createdById: supervisorId,
        createdAt: new Date(NOW.getTime() - (1000 - sequence) * 1000),
        ...data,
      },
    });
  }

  async function list(query: string, token = ana.token): Promise<PageJson> {
    const response = await request(app.getHttpServer())
      .get(`/work-orders?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body as PageJson;
  }

  const titles = (page: PageJson) => page.items.map((item) => item.title);

  const badRequest = (query: string) =>
    request(app.getHttpServer())
      .get(`/work-orders?${query}`)
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(400)
      .expect(errorCode('VALIDATION_ERROR'));

  async function summary(): Promise<SummaryJson> {
    const response = await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${ana.token}`)
      .expect(200);
    return response.body as SummaryJson;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock)
      .useValue({ now: () => NOW })
      .compile();
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
    sequence = 0;
    const supervisor = await createUser('Carla', 'carla@test.dev', 'SUPERVISOR');
    supervisorId = supervisor.id;
    ana = await createUser('Ana', 'ana@test.dev', 'OPERATOR');
    bruno = await createUser('Bruno', 'bruno@test.dev', 'OPERATOR');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('paginação', () => {
    beforeEach(async () => {
      for (let i = 0; i < 25; i++) await insert();
    });

    it('total, totalPages e última página parcial', async () => {
      const first = await list('pageSize=10');
      const last = await list('pageSize=10&page=3');

      expect(first).toMatchObject({ total: 25, page: 1, pageSize: 10, totalPages: 3 });
      expect(first.items).toHaveLength(10);
      expect(last.items).toHaveLength(5);
    });

    it('página além do fim devolve 200 com items vazio', async () => {
      const beyond = await list('pageSize=10&page=4');
      expect(beyond).toMatchObject({ items: [], total: 25, page: 4, totalPages: 3 });
    });

    it('páginas consecutivas não repetem nem pulam itens', async () => {
      const pages = await Promise.all([1, 2, 3].map((page) => list(`pageSize=10&page=${page}`)));
      const ids = pages.flatMap((page) => page.items.map((item) => item.id));

      expect(new Set(ids).size).toBe(25);
      expect(ids).toHaveLength(25);
    });

    it('empates na chave de ordenação são desfeitos pelo id', async () => {
      await prisma.$executeRaw`TRUNCATE "WorkOrder" CASCADE`;
      const sameInstant = at(-1);
      for (let i = 0; i < 7; i++) await insert({ createdAt: sameInstant, dueDate: at(5) });

      for (const sort of ['sortBy=createdAt', 'sortBy=dueDate&order=asc']) {
        const pages = await Promise.all(
          [1, 2, 3, 4].map((p) => list(`${sort}&pageSize=2&page=${p}`)),
        );
        const ids = pages.flatMap((page) => page.items.map((item) => item.id));
        expect(new Set(ids).size).toBe(7);
        expect(ids).toEqual(sort.includes('asc') ? [...ids].sort() : [...ids].sort().reverse());
      }
    });
  });

  describe('filtros', () => {
    it('status com vários valores (OR), espaços e repetição', async () => {
      await insert({ title: 'aberta', status: 'OPEN' });
      await insert({ title: 'andamento', status: 'IN_PROGRESS' });
      await insert({ title: 'concluída', status: 'DONE' });
      await insert({ title: 'cancelada', status: 'CANCELLED' });

      expect(titles(await list('status=OPEN,IN_PROGRESS')).sort()).toEqual(['aberta', 'andamento']);
      expect(titles(await list('status= DONE , DONE'))).toEqual(['concluída']);
      expect(titles(await list('status=OPEN&status=CANCELLED')).sort()).toEqual([
        'aberta',
        'cancelada',
      ]);
    });

    it('prioridade', async () => {
      await insert({ title: 'baixa', priority: 'LOW' });
      await insert({ title: 'urgente', priority: 'URGENT' });
      await insert({ title: 'alta', priority: 'HIGH' });

      expect(titles(await list('priority=HIGH,URGENT')).sort()).toEqual(['alta', 'urgente']);
    });

    it('responsável por UUID e por "me"', async () => {
      await insert({ title: 'da Ana', assigneeId: ana.id });
      await insert({ title: 'do Bruno', assigneeId: bruno.id });
      await insert({ title: 'sem responsável', assigneeId: null });

      expect(titles(await list(`assigneeId=${bruno.id}`))).toEqual(['do Bruno']);
      expect(titles(await list('assigneeId=me', ana.token))).toEqual(['da Ana']);
      expect(titles(await list('assigneeId=me', bruno.token))).toEqual(['do Bruno']);
    });

    it('intervalo de prazo inclusivo nas duas pontas', async () => {
      await insert({ title: 'antes', dueDate: new Date('2026-06-30T23:59:59.999Z') });
      await insert({ title: 'início exato', dueDate: new Date('2026-07-01T00:00:00.000Z') });
      await insert({ title: 'meio', dueDate: new Date('2026-07-15T12:00:00.000Z') });
      await insert({ title: 'fim exato', dueDate: new Date('2026-07-31T23:59:59.000Z') });
      await insert({ title: 'depois', dueDate: new Date('2026-08-01T00:00:00.000Z') });

      const range = await list(
        'dueFrom=2026-07-01T00:00:00Z&dueTo=2026-07-31T23:59:59Z&sortBy=dueDate&order=asc',
      );
      expect(titles(range)).toEqual(['início exato', 'meio', 'fim exato']);
      // Só uma das pontas também funciona.
      expect(titles(await list('dueFrom=2026-08-01T00:00:00Z'))).toEqual(['depois']);
    });

    it('intervalo com fuso: -03:00 é convertido para o instante certo', async () => {
      await insert({ title: '02:59Z', dueDate: new Date('2026-07-01T02:59:00.000Z') });
      await insert({ title: '03:00Z', dueDate: new Date('2026-07-01T03:00:00.000Z') });

      // 1º de julho, meia-noite em Brasília = 03:00 UTC.
      const fromBrazil = await list(`dueFrom=${encodeURIComponent('2026-07-01T00:00:00-03:00')}`);
      expect(titles(fromBrazil)).toEqual(['03:00Z']);
    });

    it('combinação de três filtros (AND)', async () => {
      await insert({ title: 'alvo', status: 'OPEN', priority: 'URGENT', assigneeId: ana.id });
      await insert({
        title: 'outro status',
        status: 'DONE',
        priority: 'URGENT',
        assigneeId: ana.id,
      });
      await insert({
        title: 'outra prioridade',
        status: 'OPEN',
        priority: 'LOW',
        assigneeId: ana.id,
      });
      await insert({
        title: 'outro responsável',
        status: 'OPEN',
        priority: 'URGENT',
        assigneeId: bruno.id,
      });

      expect(titles(await list('status=OPEN&priority=URGENT&assigneeId=me'))).toEqual(['alvo']);
    });
  });

  describe('overdue', () => {
    beforeEach(async () => {
      await insert({ title: 'aberta vencida', status: 'OPEN', dueDate: at(-2) });
      await insert({ title: 'em andamento vencida', status: 'IN_PROGRESS', dueDate: at(-1) });
      await insert({ title: 'concluída vencida', status: 'DONE', dueDate: at(-3) });
      await insert({ title: 'cancelada vencida', status: 'CANCELLED', dueDate: at(-3) });
      await insert({ title: 'aberta futura', status: 'OPEN', dueDate: at(1) });
      await insert({ title: 'prazo igual a agora', status: 'OPEN', dueDate: NOW });
      await insert({
        title: '1 ms antes de agora',
        status: 'OPEN',
        dueDate: new Date(NOW.getTime() - 1),
      });
    });

    it('só ativas com prazo estritamente antes de agora', async () => {
      expect(titles(await list('overdue=true')).sort()).toEqual([
        '1 ms antes de agora',
        'aberta vencida',
        'em andamento vencida',
      ]);
    });

    it('overdue=false e ausente não filtram', async () => {
      expect((await list('overdue=false')).total).toBe(7);
      expect((await list('')).total).toBe(7);
    });

    it('combina com o intervalo de prazo sem um sobrescrever o outro', async () => {
      const page = await list(`overdue=true&dueFrom=${at(-1.5).toISOString()}`);
      expect(titles(page).sort()).toEqual(['1 ms antes de agora', 'em andamento vencida']);
    });
  });

  describe('busca (q)', () => {
    beforeEach(async () => {
      await insert({ title: 'Trocar FILTRO do ar', description: null });
      await insert({ title: 'Porta travando', description: 'Verificar o filtro de entrada' });
      await insert({ title: 'Desconto de 50% aplicado' });
      await insert({ title: 'Bateria em 500 ciclos' });
      await insert({ title: 'Campo A_B errado' });
      await insert({ title: 'Campo AXB errado' });
      await insert({ title: 'Caminho C:\\temp' });
      await insert({ title: 'Manutenção do portão' });
    });

    it('acha por trecho do título e da descrição, sem diferenciar maiúsculas', async () => {
      expect(titles(await list('q=filtro')).sort()).toEqual([
        'Porta travando',
        'Trocar FILTRO do ar',
      ]);
      expect(titles(await list('q=FiLtRo')).sort()).toEqual([
        'Porta travando',
        'Trocar FILTRO do ar',
      ]);
    });

    it.each([
      ['50%', ['Desconto de 50% aplicado']],
      ['A_B', ['Campo A_B errado']],
      ['_', ['Campo A_B errado']],
      ['%', ['Desconto de 50% aplicado']],
      ['C:\\temp', ['Caminho C:\\temp']],
    ])('%j vale literalmente, sem virar curinga', async (q, expected) => {
      expect(titles(await list(`q=${encodeURIComponent(q)}`))).toEqual(expected);
    });

    it('aplica trim e ignora q vazio', async () => {
      expect(titles(await list(`q=${encodeURIComponent('  portão ')}`))).toEqual([
        'Manutenção do portão',
      ]);
      expect((await list('q=')).total).toBe(8);
      expect((await list(`q=${encodeURIComponent('   ')}`)).total).toBe(8);
    });

    it('limitação conhecida: não ignora acentos', async () => {
      expect((await list('q=manutencao')).total).toBe(0);
      expect((await list(`q=${encodeURIComponent('manutenção')}`)).total).toBe(1);
    });
  });

  describe('ordenação', () => {
    it('prioridade pela gravidade, nos dois sentidos', async () => {
      for (const priority of ['HIGH', 'LOW', 'URGENT', 'MEDIUM'] as const) {
        await insert({ title: priority, priority });
      }

      expect(titles(await list('sortBy=priority&order=asc'))).toEqual([
        'LOW',
        'MEDIUM',
        'HIGH',
        'URGENT',
      ]);
      expect(titles(await list('sortBy=priority&order=desc'))).toEqual([
        'URGENT',
        'HIGH',
        'MEDIUM',
        'LOW',
      ]);
    });

    it('prazo nos dois sentidos', async () => {
      await insert({ title: 'meio', dueDate: at(5) });
      await insert({ title: 'cedo', dueDate: at(1) });
      await insert({ title: 'tarde', dueDate: at(9) });

      expect(titles(await list('sortBy=dueDate&order=asc'))).toEqual(['cedo', 'meio', 'tarde']);
      expect(titles(await list('sortBy=dueDate&order=desc'))).toEqual(['tarde', 'meio', 'cedo']);
    });

    it('padrão: createdAt desc', async () => {
      await insert({ title: 'primeira' });
      await insert({ title: 'segunda' });
      expect(titles(await list(''))).toEqual(['segunda', 'primeira']);
    });

    it('updatedAt', async () => {
      await insert({ title: 'mexida há pouco', updatedAt: at(-1) });
      await insert({ title: 'mexida há muito', updatedAt: at(-9) });
      expect(titles(await list('sortBy=updatedAt&order=asc'))).toEqual([
        'mexida há muito',
        'mexida há pouco',
      ]);
    });
  });

  describe('validação (400)', () => {
    // O `details` aponta o parâmetro da query, para o front saber qual filtro corrigir.
    it.each([
      [
        'dueFrom depois de dueTo',
        'dueFrom=2026-07-02T00:00:00Z&dueTo=2026-07-01T00:00:00Z',
        'dueTo',
      ],
      ['status inválido', 'status=OPEN,PAUSED', 'status'],
      ['prioridade inválida', 'priority=ALTA', 'priority'],
      ['pageSize acima de 100', 'pageSize=101', 'pageSize'],
      ['sortBy fora da lista', 'sortBy=title', 'sortBy'],
      ['order inválido', 'order=up', 'order'],
      ['assigneeId que não é UUID', 'assigneeId=ana', 'assigneeId'],
      ['overdue que não é booleano', 'overdue=sim', 'overdue'],
      ['dueFrom sem hora', 'dueFrom=2026-07-01', 'dueFrom'],
      ['dueTo inválido', 'dueTo=amanha', 'dueTo'],
      ['q acima de 100 caracteres', `q=${'a'.repeat(101)}`, 'q'],
      ['parâmetro desconhecido', 'cor=azul', 'cor'],
    ])('%s → details no campo %s', async (_name, query, field) => {
      const response = await badRequest(query);
      const { details } = response.body as { details: { field: string; messages: string[] }[] };
      expect(details.map((detail) => detail.field)).toEqual([field]);
      expect(details[0].messages.length).toBeGreaterThan(0);
    });

    it('401 sem token', async () => {
      await request(app.getHttpServer())
        .get('/work-orders')
        .expect(401)
        .expect(errorCode('UNAUTHORIZED'));
    });
  });

  describe('GET /dashboard/summary', () => {
    it('banco vazio: todas as chaves com zero', async () => {
      expect(await summary()).toEqual({
        byStatus: { OPEN: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 },
        overdue: { count: 0, items: [] },
        generatedAt: NOW.toISOString(),
      });
    });

    it('status sem ordens aparecem com zero', async () => {
      await insert({ status: 'OPEN' });
      await insert({ status: 'OPEN' });
      await insert({ status: 'DONE' });

      expect((await summary()).byStatus).toEqual({
        OPEN: 2,
        IN_PROGRESS: 0,
        DONE: 1,
        CANCELLED: 0,
      });
    });

    it('atrasadas: contagem total, até 10 itens, prazo mais antigo primeiro', async () => {
      // 12 atrasadas (de 12 a 1 dia), inseridas fora de ordem, mais 2 que não contam.
      for (const days of [3, 12, 1, 7, 5, 9, 2, 11, 4, 8, 10, 6]) {
        await insert({
          title: `vencida há ${days}`,
          dueDate: at(-days),
          status: days % 2 ? 'OPEN' : 'IN_PROGRESS',
        });
      }
      await insert({ title: 'concluída vencida', status: 'DONE', dueDate: at(-30) });
      await insert({ title: 'futura', dueDate: at(3) });

      const { overdue } = await summary();

      expect(overdue.count).toBe(12);
      expect(overdue.items).toHaveLength(10);
      expect(overdue.items.map((item) => item.title)).toEqual(
        [12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map((days) => `vencida há ${days}`),
      );
      expect(Object.keys(overdue.items[0]).sort()).toEqual([
        'assignee',
        'createdAt',
        'createdBy',
        'description',
        'dueDate',
        'id',
        'priority',
        'status',
        'title',
        'updatedAt',
      ]);
    });

    it('bate com a lista usando os mesmos filtros', async () => {
      const statuses = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
      for (let i = 0; i < 23; i++) {
        await insert({ status: statuses[i % 4], dueDate: at((i % 7) - 3) });
      }

      const result = await summary();
      const sum = Object.values(result.byStatus).reduce((a, b) => a + b, 0);

      expect(sum).toBe((await list('')).total);
      for (const status of statuses) {
        expect(result.byStatus[status]).toBe((await list(`status=${status}`)).total);
      }
      const overdueList = await list('overdue=true&sortBy=dueDate&order=asc&pageSize=10');
      expect(result.overdue.count).toBe(overdueList.total);
      expect(result.overdue.items.map((item) => item.id)).toEqual(
        overdueList.items.map((item) => item.id),
      );
    });

    it('401 sem token', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/summary')
        .expect(401)
        .expect(errorCode('UNAUTHORIZED'));
    });
  });
});
