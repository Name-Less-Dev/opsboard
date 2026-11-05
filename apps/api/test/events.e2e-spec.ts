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

type EventJson = {
  id: string;
  type: string;
  actor: { id: string; name: string };
  fromStatus: string | null;
  toStatus: string | null;
  details: unknown;
  createdAt: string;
};
type EventPageJson = {
  items: EventJson[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const PASSWORD = 'senha-de-teste';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const SECRET_DESCRIPTION = 'Texto sigiloso da descrição';
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('Histórico de eventos (integração com banco real)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let supervisor: { id: string; token: string };
  let ana: { id: string; token: string };

  const api = (token?: string) => {
    const agent = request(app.getHttpServer());
    const withAuth = (req: request.Test) =>
      token ? req.set('Authorization', `Bearer ${token}`) : req;
    return {
      get: (path: string) => withAuth(agent.get(path)),
      post: (path: string, body: object) => withAuth(agent.post(path)).send(body),
      patch: (path: string, body: object) => withAuth(agent.patch(path)).send(body),
      delete: (path: string) => withAuth(agent.delete(path)),
    };
  };

  async function createUser(name: string, email: string, role: 'OPERATOR' | 'SUPERVISOR') {
    const passwordHash = await hash(PASSWORD, 4);
    const user = await prisma.user.create({ data: { name, email, role, passwordHash } });
    const login = await api().post('/auth/login', { email, password: PASSWORD }).expect(200);
    return { id: user.id, token: (login.body as LoginResult).accessToken };
  }

  async function createOrder(overrides: object = {}): Promise<{ id: string }> {
    const response = await api(supervisor.token)
      .post('/work-orders', {
        title: 'Trocar filtro',
        priority: 'MEDIUM',
        dueDate: inDays(3),
        ...overrides,
      })
      .expect(201);
    return response.body as { id: string };
  }

  async function history(orderId: string, query = '', token = supervisor.token) {
    const response = await api(token).get(`/work-orders/${orderId}/events${query}`).expect(200);
    return response.body as EventPageJson;
  }

  /** Eventos gravados direto no banco, com instantes crescentes a partir de `base`. */
  async function insertUpdates(orderId: string, count: number, base = Date.now() - 3_600_000) {
    await prisma.workOrderEvent.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        workOrderId: orderId,
        actorId: supervisor.id,
        type: 'UPDATED' as const,
        payload: { title: { from: `T${index}`, to: `T${index + 1}` } },
        createdAt: new Date(base + index * 1000),
      })),
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = app.get(PrismaService);

    const [{ name }] = await prisma.$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`;
    expect(name).toBe(new URL(getTestDatabaseUrl()).pathname.slice(1));
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE "WorkOrderEvent", "WorkOrder", "User" CASCADE`;
    supervisor = await createUser('Carla', 'carla@test.dev', 'SUPERVISOR');
    ana = await createUser('Ana', 'ana@test.dev', 'OPERATOR');
  });

  afterAll(async () => {
    await app.close();
  });

  it('sequência real pelos endpoints: cinco eventos, mais recente primeiro', async () => {
    const { id } = await createOrder();
    const path = `/work-orders/${id}`;
    await api(supervisor.token).patch(`${path}/assignee`, { assigneeId: ana.id }).expect(200);
    await api(ana.token).patch(`${path}/status`, { status: 'IN_PROGRESS' }).expect(200);
    await api(ana.token).patch(path, { title: 'Trocar filtro do ar' }).expect(200);
    await api(ana.token).patch(`${path}/status`, { status: 'DONE' }).expect(200);

    const page = await history(id);

    expect(page).toMatchObject({ total: 5, page: 1, pageSize: 20, totalPages: 1 });
    expect(
      page.items.map(({ type, actor, fromStatus, toStatus, details }) => ({
        type,
        actor: actor.name,
        fromStatus,
        toStatus,
        details,
      })),
    ).toEqual([
      {
        type: 'STATUS_CHANGED',
        actor: 'Ana',
        fromStatus: 'IN_PROGRESS',
        toStatus: 'DONE',
        details: null,
      },
      {
        type: 'UPDATED',
        actor: 'Ana',
        fromStatus: null,
        toStatus: null,
        details: {
          changes: [{ field: 'title', from: 'Trocar filtro', to: 'Trocar filtro do ar' }],
        },
      },
      {
        type: 'STATUS_CHANGED',
        actor: 'Ana',
        fromStatus: 'OPEN',
        toStatus: 'IN_PROGRESS',
        details: null,
      },
      {
        type: 'ASSIGNED',
        actor: 'Carla',
        fromStatus: null,
        toStatus: null,
        details: { from: null, to: { id: ana.id, name: 'Ana' } },
      },
      { type: 'CREATED', actor: 'Carla', fromStatus: null, toStatus: 'OPEN', details: null },
    ]);
    expect(page.items[4].actor).toEqual({ id: supervisor.id, name: 'Carla' });
  });

  it('remover o responsável e prioridade/prazo saem tipados', async () => {
    const { id } = await createOrder({ assigneeId: ana.id });
    const due = inDays(10);
    await api(supervisor.token)
      .patch(`/work-orders/${id}`, { priority: 'URGENT', dueDate: due })
      .expect(200);
    await api(supervisor.token)
      .patch(`/work-orders/${id}/assignee`, { assigneeId: null })
      .expect(200);

    const [unassigned, edited] = (await history(id)).items;
    expect(unassigned.details).toEqual({ from: { id: ana.id, name: 'Ana' }, to: null });
    expect(edited.details).toEqual({
      changes: [
        { field: 'priority', from: 'MEDIUM', to: 'URGENT' },
        { field: 'dueDate', from: expect.any(String) as string, to: due },
      ],
    });
  });

  describe('paginação', () => {
    it('total, totalPages, última página parcial e página além do fim vazia', async () => {
      const { id } = await createOrder(); // CREATED
      await insertUpdates(id, 24); // + 24 = 25 eventos

      const first = await history(id, '?pageSize=10');
      const second = await history(id, '?pageSize=10&page=2');
      const last = await history(id, '?pageSize=10&page=3');
      const beyond = await history(id, '?pageSize=10&page=4');

      expect(first).toMatchObject({ total: 25, totalPages: 3, page: 1, pageSize: 10 });
      expect(first.items).toHaveLength(10);
      expect(last.items).toHaveLength(5);
      expect(beyond).toMatchObject({ items: [], total: 25, totalPages: 3, page: 4 });

      // Sem repetir nem pular: as páginas juntas são a lista inteira, na ordem.
      const ids = [first, second, last].flatMap((page) => page.items.map((item) => item.id));
      expect(new Set(ids).size).toBe(25);
      const all = await history(id, '?pageSize=100');
      expect(ids).toEqual(all.items.map((item) => item.id));
      const times = all.items.map((item) => Date.parse(item.createdAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('empate no mesmo createdAt: ordem estável por id, sem repetir entre páginas', async () => {
      const { id } = await createOrder();
      const sameInstant = new Date(Date.now() - 60_000);
      await prisma.workOrderEvent.createMany({
        data: Array.from({ length: 5 }, () => ({
          workOrderId: id,
          actorId: supervisor.id,
          type: 'STATUS_CHANGED' as const,
          fromStatus: 'OPEN' as const,
          toStatus: 'IN_PROGRESS' as const,
          payload: {},
          createdAt: sameInstant,
        })),
      });

      const pages = await Promise.all(
        [1, 2, 3, 4, 5].map((page) => history(id, `?pageSize=1&page=${page + 1}`)),
      );
      const tied = pages.map((page) => page.items[0].id);
      expect(new Set(tied).size).toBe(5);
      // Mesmo sentido da ordenação: id decrescente dentro do empate.
      expect(tied).toEqual([...tied].sort().reverse());
      // Repetir a consulta dá a mesma ordem.
      const again = await history(id, '?pageSize=6');
      expect(again.items.slice(1).map((item) => item.id)).toEqual(tied);
    });
  });

  it('erros: 401 sem token, 404 ordem inexistente, 400 em query ou id inválidos', async () => {
    const { id } = await createOrder();
    const path = `/work-orders/${id}/events`;

    await api().get(path).expect(401).expect(errorCode('UNAUTHORIZED'));
    await api(ana.token)
      .get(`/work-orders/${UNKNOWN_ID}/events`)
      .expect(404)
      .expect(errorCode('NOT_FOUND'));
    await api(ana.token)
      .get(`${path}?pageSize=101`)
      .expect(400)
      .expect(errorCode('VALIDATION_ERROR'));
    await api(ana.token).get(`${path}?pageSize=0`).expect(400);
    await api(ana.token).get(`${path}?page=0`).expect(400);
    await api(ana.token)
      .get(`${path}?type=CREATED`)
      .expect(400)
      .expect(errorCode('VALIDATION_ERROR'));
    await api(ana.token)
      .get('/work-orders/abc/events')
      .expect(400)
      .expect(errorCode('VALIDATION_ERROR'));
  });

  it('nenhum campo sensível: sem e-mail, hash, payload bruto nem texto da descrição', async () => {
    const { id } = await createOrder({ description: SECRET_DESCRIPTION, assigneeId: ana.id });
    await api(supervisor.token)
      .patch(`/work-orders/${id}`, { description: `${SECRET_DESCRIPTION} (revisada)` })
      .expect(200);

    const response = await api(ana.token).get(`/work-orders/${id}/events`).expect(200);
    const raw = JSON.stringify(response.body);
    expect(raw).not.toMatch(/@test\.dev/);
    expect(raw).not.toMatch(/passwordHash|email|payload/);
    expect(raw).not.toContain(SECRET_DESCRIPTION);

    const page = response.body as EventPageJson;
    for (const item of page.items) {
      expect(Object.keys(item).sort()).toEqual([
        'actor',
        'createdAt',
        'details',
        'fromStatus',
        'id',
        'toStatus',
        'type',
      ]);
      expect(Object.keys(item.actor).sort()).toEqual(['id', 'name']);
    }
    expect(page.items[0]).toMatchObject({
      type: 'UPDATED',
      details: { changes: [{ field: 'description' }] },
    });
  });

  it('excluir a ordem: histórico dá 404 e a tabela fica sem eventos dela', async () => {
    const { id } = await createOrder();
    await api(supervisor.token).patch(`/work-orders/${id}/assignee`, { assigneeId: ana.id });
    expect(await prisma.workOrderEvent.count({ where: { workOrderId: id } })).toBe(2);

    await api(supervisor.token).delete(`/work-orders/${id}`).expect(204);

    await api(ana.token)
      .get(`/work-orders/${id}/events`)
      .expect(404)
      .expect(errorCode('NOT_FOUND'));
    expect(await prisma.workOrderEvent.count({ where: { workOrderId: id } })).toBe(0);
  });

  it('payload inesperado gravado direto no banco: 200 com details null', async () => {
    const { id } = await createOrder();
    const base = Date.now() + 1000;
    await prisma.workOrderEvent.createMany({
      data: [
        {
          workOrderId: id,
          actorId: supervisor.id,
          type: 'UPDATED',
          payload: { color: 'azul' },
          createdAt: new Date(base),
        },
        {
          workOrderId: id,
          actorId: supervisor.id,
          type: 'ASSIGNED',
          payload: 'texto',
          createdAt: new Date(base + 1),
        },
        {
          workOrderId: id,
          actorId: supervisor.id,
          type: 'UPDATED',
          payload: [],
          createdAt: new Date(base + 2),
        },
        // Responsável que não existe mais: o evento sai, com nome null.
        {
          workOrderId: id,
          actorId: supervisor.id,
          type: 'ASSIGNED',
          payload: { from: UNKNOWN_ID, to: null },
          createdAt: new Date(base + 3),
        },
      ],
    });

    const page = await history(id);
    expect(page.total).toBe(5);
    expect(page.items.map((item) => [item.type, item.details])).toEqual([
      ['ASSIGNED', { from: { id: UNKNOWN_ID, name: null }, to: null }],
      ['UPDATED', null],
      ['ASSIGNED', null],
      ['UPDATED', null],
      ['CREATED', null],
    ]);
  });

  it('nomes das atribuições: uma consulta de usuários para a página inteira', async () => {
    const bruno = await createUser('Bruno', 'bruno@test.dev', 'OPERATOR');
    const { id } = await createOrder();
    for (const assigneeId of [ana.id, bruno.id, ana.id, null, bruno.id]) {
      await api(supervisor.token).patch(`/work-orders/${id}/assignee`, { assigneeId }).expect(200);
    }
    const findMany = jest.spyOn(prisma.user, 'findMany');

    const page = await history(id);

    expect(findMany).toHaveBeenCalledTimes(1);
    findMany.mockRestore();
    expect(page.items.filter((item) => item.type === 'ASSIGNED')).toHaveLength(5);
    expect(page.items[0].details).toEqual({ from: null, to: { id: bruno.id, name: 'Bruno' } });
  });

  it('operador e supervisor leem o mesmo conteúdo', async () => {
    const { id } = await createOrder({ assigneeId: ana.id });
    await api(ana.token).patch(`/work-orders/${id}/status`, { status: 'IN_PROGRESS' }).expect(200);

    const byOperator = await history(id, '', ana.token);
    const bySupervisor = await history(id, '', supervisor.token);
    expect(byOperator).toEqual(bySupervisor);
    expect(byOperator.total).toBe(2);
  });
});
