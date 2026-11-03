import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { LoginResult } from './../src/auth/auth.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { getTestDatabaseUrl } from './test-database';
import { errorCode } from './error-code';

type UserRef = { id: string; name: string };
type OrderJson = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string;
  assignee: UserRef | null;
  createdBy: UserRef;
};
type PageJson = { items: OrderJson[]; total: number; page: number; pageSize: number };

const PASSWORD = 'senha-de-teste';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('Ordens de serviço (integração com banco real)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let supervisor: { id: string; token: string };
  let ana: { id: string; token: string };
  let bruno: { id: string; token: string };

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
    const passwordHash = await hash(PASSWORD, 4); // custo baixo só para o teste ser rápido
    const user = await prisma.user.create({ data: { name, email, role, passwordHash } });
    const login = await api().post('/auth/login', { email, password: PASSWORD }).expect(200);
    return { id: user.id, token: (login.body as LoginResult).accessToken };
  }

  async function createOrder(actor: { token: string }, overrides: object = {}): Promise<OrderJson> {
    const response = await api(actor.token)
      .post('/work-orders', {
        title: 'Trocar filtro',
        priority: 'MEDIUM',
        dueDate: inDays(3),
        ...overrides,
      })
      .expect(201);
    return response.body as OrderJson;
  }

  const setStatus = (actor: { token: string }, id: string, status: string) =>
    api(actor.token).patch(`/work-orders/${id}/status`, { status });

  const eventsOf = (workOrderId: string) =>
    prisma.workOrderEvent.findMany({ where: { workOrderId }, orderBy: { createdAt: 'asc' } });

  const statusInDb = async (id: string) =>
    (await prisma.workOrder.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    // Escutando numa porta: o teste de corrida faz requisições simultâneas.
    await app.listen(0);
    prisma = app.get(PrismaService);

    // Última barreira antes do TRUNCATE: confere o banco conectado de verdade.
    const [{ name }] = await prisma.$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`;
    expect(name).toBe(new URL(getTestDatabaseUrl()).pathname.slice(1));
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE "WorkOrderEvent", "WorkOrder", "User" CASCADE`;
    supervisor = await createUser('Carla', 'carla@test.dev', 'SUPERVISOR');
    ana = await createUser('Ana', 'ana@test.dev', 'OPERATOR');
    bruno = await createUser('Bruno', 'bruno@test.dev', 'OPERATOR');
  });

  afterAll(async () => {
    await app.close();
  });

  it('exige autenticação em todos os endpoints', async () => {
    const order = await createOrder(ana);
    const path = `/work-orders/${order.id}`;

    await api().get('/work-orders').expect(401).expect(errorCode('UNAUTHORIZED'));
    await api().post('/work-orders', {}).expect(401).expect(errorCode('UNAUTHORIZED'));
    await api().get(path).expect(401).expect(errorCode('UNAUTHORIZED'));
    await api().patch(path, {}).expect(401).expect(errorCode('UNAUTHORIZED'));
    await api().patch(`${path}/status`, {}).expect(401).expect(errorCode('UNAUTHORIZED'));
    await api().patch(`${path}/assignee`, {}).expect(401).expect(errorCode('UNAUTHORIZED'));
    await api().delete(path).expect(401).expect(errorCode('UNAUTHORIZED'));
  });

  describe('POST /work-orders', () => {
    it('operador cria e vira o responsável, com evento CREATED', async () => {
      const order = await createOrder(ana, { description: 'Filtro saturado' });

      expect(order).toMatchObject({
        status: 'OPEN',
        description: 'Filtro saturado',
        assignee: { id: ana.id, name: 'Ana' },
        createdBy: { id: ana.id, name: 'Ana' },
      });
      const events = await eventsOf(order.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'CREATED',
        actorId: ana.id,
        fromStatus: null,
        toStatus: 'OPEN',
        payload: { title: 'Trocar filtro', assigneeId: ana.id },
      });
    });

    it.each([
      ['nulo', null],
      ['o próprio id', 'self'],
    ])('operador enviando responsável %s também vira o responsável', async (_name, value) => {
      const assigneeId = value === 'self' ? ana.id : value;
      const order = await createOrder(ana, { assigneeId });
      expect(order.assignee?.id).toBe(ana.id);
    });

    it('operador com outro responsável recebe 403, mesmo se o usuário não existir', async () => {
      const body = { title: 'Trocar filtro', priority: 'LOW', dueDate: inDays(1) };
      await api(ana.token)
        .post('/work-orders', { ...body, assigneeId: bruno.id })
        .expect(403)
        .expect(errorCode('FORBIDDEN'));
      await api(ana.token)
        .post('/work-orders', { ...body, assigneeId: UNKNOWN_ID })
        .expect(403)
        .expect(errorCode('FORBIDDEN'));
      expect(await prisma.workOrder.count()).toBe(0);
    });

    it('supervisor escolhe qualquer responsável, ou nenhum', async () => {
      const assigned = await createOrder(supervisor, { assigneeId: bruno.id });
      const unassigned = await createOrder(supervisor);

      expect(assigned.assignee?.id).toBe(bruno.id);
      expect(unassigned.assignee).toBeNull();
    });

    it('supervisor com responsável inexistente recebe 400', async () => {
      await api(supervisor.token)
        .post('/work-orders', {
          title: 'Trocar filtro',
          priority: 'LOW',
          dueDate: inDays(1),
          assigneeId: UNKNOWN_ID,
        })
        .expect(400)
        .expect(errorCode('VALIDATION_ERROR'));
    });

    it('a resposta não expõe dados sensíveis de usuário', async () => {
      const order = await createOrder(ana);
      expect(Object.keys(order.assignee ?? {}).sort()).toEqual(['id', 'name']);
      expect(Object.keys(order.createdBy).sort()).toEqual(['id', 'name']);
    });

    const VALID = { title: 'Título válido', priority: 'LOW', dueDate: inDays(1) };
    it.each([
      ['título curto', { ...VALID, title: 'ab' }],
      ['título longo', { ...VALID, title: 'a'.repeat(121) }],
      ['título só com espaços', { ...VALID, title: '     ' }],
      ['sem título', { priority: 'LOW', dueDate: inDays(1) }],
      ['descrição longa', { ...VALID, description: 'a'.repeat(2001) }],
      ['prioridade inválida', { ...VALID, priority: 'ALTA' }],
      ['sem prioridade', { title: 'Título válido', dueDate: inDays(1) }],
      ['sem prazo', { title: 'Título válido', priority: 'LOW' }],
      ['prazo no passado', { ...VALID, dueDate: inDays(-1) }],
      ['prazo sem hora', { ...VALID, dueDate: '2099-01-01' }],
      ['prazo sem fuso', { ...VALID, dueDate: '2099-01-01T10:00:00' }],
      ['data impossível', { ...VALID, dueDate: '2099-02-30T10:00:00Z' }],
      ['responsável que não é UUID', { ...VALID, assigneeId: 'abc' }],
      ['campo extra', { ...VALID, status: 'DONE' }],
    ])('400: %s', async (_name, body) => {
      await api(supervisor.token)
        .post('/work-orders', body)
        .expect(400)
        .expect(errorCode('VALIDATION_ERROR'));
      expect(await prisma.workOrder.count()).toBe(0);
    });

    it('aplica trim no título e na descrição', async () => {
      const order = await createOrder(ana, { title: '  Com espaços  ', description: '  texto ' });
      expect(order.title).toBe('Com espaços');
      expect(order.description).toBe('texto');
    });
  });

  describe('GET /work-orders', () => {
    it('pagina, das mais recentes para as mais antigas', async () => {
      await createOrder(ana, { title: 'Primeira' });
      await createOrder(bruno, { title: 'Segunda' });
      await createOrder(ana, { title: 'Terceira' });

      const first = await api(ana.token).get('/work-orders?page=1&pageSize=2').expect(200);
      const second = await api(ana.token).get('/work-orders?page=2&pageSize=2').expect(200);

      const firstPage = first.body as PageJson;
      expect(firstPage).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(firstPage.items.map((item) => item.title)).toEqual(['Terceira', 'Segunda']);
      expect((second.body as PageJson).items.map((item) => item.title)).toEqual(['Primeira']);
    });

    it('usa página 1 e 20 itens por padrão', async () => {
      const response = await api(ana.token).get('/work-orders').expect(200);
      expect(response.body).toEqual({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
    });

    it.each(['pageSize=101', 'pageSize=0', 'page=0', 'page=abc', 'filtro=x'])(
      '400: ?%s',
      async (query) => {
        await api(ana.token)
          .get(`/work-orders?${query}`)
          .expect(400)
          .expect(errorCode('VALIDATION_ERROR'));
      },
    );
  });

  describe('GET /work-orders/:id', () => {
    it('qualquer autenticado vê ordens de outros', async () => {
      const order = await createOrder(ana);
      const response = await api(bruno.token).get(`/work-orders/${order.id}`).expect(200);
      expect((response.body as OrderJson).id).toBe(order.id);
    });

    it('404 para ordem inexistente e 400 para id que não é UUID', async () => {
      await api(ana.token)
        .get(`/work-orders/${UNKNOWN_ID}`)
        .expect(404)
        .expect(errorCode('NOT_FOUND'));
      await api(ana.token)
        .get('/work-orders/abc')
        .expect(400)
        .expect(errorCode('VALIDATION_ERROR'))
        .expect((response) =>
          expect((response.body as { details: unknown }).details).toEqual([
            { field: 'id', messages: ['id must be a UUID'] },
          ]),
        );
    });
  });

  describe('PATCH /work-orders/:id/status', () => {
    it('operador inicia e conclui a própria ordem, com eventos corretos', async () => {
      const order = await createOrder(ana);

      await setStatus(ana, order.id, 'IN_PROGRESS').expect(200);
      const done = await setStatus(ana, order.id, 'DONE').expect(200);

      expect((done.body as OrderJson).status).toBe('DONE');
      const events = await eventsOf(order.id);
      expect(events.map((e) => [e.type, e.actorId, e.fromStatus, e.toStatus])).toEqual([
        ['CREATED', ana.id, null, 'OPEN'],
        ['STATUS_CHANGED', ana.id, 'OPEN', 'IN_PROGRESS'],
        ['STATUS_CHANGED', ana.id, 'IN_PROGRESS', 'DONE'],
      ]);
    });

    it('operador não inicia nem conclui ordem de outro (403)', async () => {
      const order = await createOrder(ana);
      await setStatus(bruno, order.id, 'IN_PROGRESS').expect(403).expect(errorCode('FORBIDDEN'));

      await setStatus(ana, order.id, 'IN_PROGRESS').expect(200);
      await setStatus(bruno, order.id, 'DONE').expect(403).expect(errorCode('FORBIDDEN'));

      expect(await statusInDb(order.id)).toBe('IN_PROGRESS');
    });

    it('operador não inicia ordem sem responsável; supervisor sim', async () => {
      const order = await createOrder(supervisor);
      await setStatus(ana, order.id, 'IN_PROGRESS').expect(403).expect(errorCode('FORBIDDEN'));
      await setStatus(supervisor, order.id, 'IN_PROGRESS').expect(200);
    });

    it('supervisor inicia e conclui ordem de qualquer um', async () => {
      const order = await createOrder(ana);
      await setStatus(supervisor, order.id, 'IN_PROGRESS').expect(200);
      await setStatus(supervisor, order.id, 'DONE').expect(200);
      expect(await statusInDb(order.id)).toBe('DONE');
    });

    it.each(['OPEN', 'IN_PROGRESS'])(
      'responsável operador não cancela a partir de %s (403); supervisor sim',
      async (from) => {
        const order = await createOrder(ana);
        if (from === 'IN_PROGRESS') await setStatus(ana, order.id, 'IN_PROGRESS').expect(200);

        await setStatus(ana, order.id, 'CANCELLED').expect(403).expect(errorCode('FORBIDDEN'));
        expect(await statusInDb(order.id)).toBe(from);

        await setStatus(supervisor, order.id, 'CANCELLED').expect(200);
        const last = (await eventsOf(order.id)).at(-1);
        expect(last).toMatchObject({
          type: 'STATUS_CHANGED',
          actorId: supervisor.id,
          fromStatus: from,
          toStatus: 'CANCELLED',
        });
      },
    );

    it('409 fora do grafo: DONE → IN_PROGRESS, OPEN → DONE e OPEN → OPEN', async () => {
      const finished = await createOrder(ana);
      await setStatus(ana, finished.id, 'IN_PROGRESS').expect(200);
      await setStatus(ana, finished.id, 'DONE').expect(200);
      await setStatus(supervisor, finished.id, 'IN_PROGRESS')
        .expect(409)
        .expect(errorCode('INVALID_TRANSITION'));

      const open = await createOrder(ana);
      await setStatus(supervisor, open.id, 'DONE')
        .expect(409)
        .expect(errorCode('INVALID_TRANSITION'));
      await setStatus(supervisor, open.id, 'OPEN')
        .expect(409)
        .expect(errorCode('INVALID_TRANSITION'));
    });

    it('o fluxo vem antes da permissão: não responsável em transição inválida recebe 409', async () => {
      const order = await createOrder(ana);
      await setStatus(bruno, order.id, 'DONE').expect(409).expect(errorCode('INVALID_TRANSITION'));
    });

    it('400 para status inválido e 404 para ordem inexistente', async () => {
      const order = await createOrder(ana);
      await setStatus(ana, order.id, 'PAUSED').expect(400).expect(errorCode('VALIDATION_ERROR'));
      await setStatus(ana, UNKNOWN_ID, 'IN_PROGRESS').expect(404).expect(errorCode('NOT_FOUND'));
    });

    it('se a gravação do evento falhar, a mudança de status não persiste', async () => {
      const order = await createOrder(ana);
      // Falha real dentro do banco, só nesta tabela e só neste teste.
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION fail_event_insert() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'falha simulada'; END;
        $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER fail_event_insert BEFORE INSERT ON "WorkOrderEvent"
        FOR EACH ROW EXECUTE FUNCTION fail_event_insert()`);

      try {
        const response = await setStatus(ana, order.id, 'IN_PROGRESS')
          .expect(500)
          .expect(errorCode('INTERNAL_ERROR'));
        // Erro real do Postgres via Prisma: nada dele (mensagem, tabela, código) chega ao cliente.
        expect(JSON.stringify(response.body)).not.toMatch(
          /falha simulada|WorkOrderEvent|P\d{4}|prisma/i,
        );
      } finally {
        await prisma.$executeRawUnsafe('DROP FUNCTION fail_event_insert CASCADE');
      }

      expect(await statusInDb(order.id)).toBe('OPEN');
      expect(await eventsOf(order.id)).toHaveLength(1);
    });

    it('leitura desatualizada: o updateMany condicionado barra a mudança com 409', async () => {
      const order = await createOrder(ana);
      await setStatus(ana, order.id, 'IN_PROGRESS').expect(200);
      const stale = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
      await setStatus(supervisor, order.id, 'CANCELLED').expect(200);

      // Reproduz sem depender de tempo: a próxima leitura devolve a ordem de antes do cancelamento,
      // como se as duas requisições tivessem lido ao mesmo tempo. A política aprova; só o banco barra.
      const realFindUnique = prisma.workOrder.findUnique.bind(prisma.workOrder);
      const read = jest
        .spyOn(prisma.workOrder, 'findUnique')
        .mockImplementationOnce(((args: Parameters<typeof realFindUnique>[0]) =>
          args.where.id === order.id ? Promise.resolve(stale) : realFindUnique(args)) as never);
      try {
        const response = await setStatus(ana, order.id, 'DONE')
          .expect(409)
          .expect(errorCode('CONCURRENT_UPDATE'));
        expect((response.body as { message: string }).message).toContain('outra requisição');
      } finally {
        read.mockRestore();
      }

      expect(await statusInDb(order.id)).toBe('CANCELLED');
      expect((await eventsOf(order.id)).filter((e) => e.toStatus === 'DONE')).toHaveLength(0);
    });

    it('duas mudanças simultâneas: uma vence, a outra recebe 409 e só um evento é gravado', async () => {
      const order = await createOrder(ana);
      await setStatus(ana, order.id, 'IN_PROGRESS').expect(200);

      const responses = await Promise.all([
        setStatus(supervisor, order.id, 'DONE'),
        setStatus(supervisor, order.id, 'CANCELLED'),
      ]);

      expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
      const winner = responses.find((r) => r.status === 200)?.body as OrderJson;
      expect(await statusInDb(order.id)).toBe(winner.status);
      const changes = (await eventsOf(order.id)).filter((e) => e.fromStatus === 'IN_PROGRESS');
      expect(changes).toHaveLength(1);
      expect(changes[0].toStatus).toBe(winner.status);
    });
  });

  describe('PATCH /work-orders/:id', () => {
    it('responsável operador edita título e descrição, com evento UPDATED antes e depois', async () => {
      const order = await createOrder(ana, { title: 'Título antigo', description: 'Antes' });

      const response = await api(ana.token)
        .patch(`/work-orders/${order.id}`, { title: 'Título novo', description: 'Depois' })
        .expect(200);

      expect(response.body).toMatchObject({ title: 'Título novo', description: 'Depois' });
      expect((await eventsOf(order.id)).at(-1)).toMatchObject({
        type: 'UPDATED',
        actorId: ana.id,
        payload: {
          title: { from: 'Título antigo', to: 'Título novo' },
          description: { from: 'Antes', to: 'Depois' },
        },
      });
    });

    it('não grava evento quando nada mudou de fato', async () => {
      const order = await createOrder(ana, { title: 'Mesmo título' });

      await api(ana.token).patch(`/work-orders/${order.id}`, { title: 'Mesmo título' }).expect(200);
      await api(supervisor.token)
        .patch(`/work-orders/${order.id}`, { dueDate: order.dueDate, priority: order.priority })
        .expect(200);

      expect(await eventsOf(order.id)).toHaveLength(1);
    });

    it('registra só o campo que mudou', async () => {
      const order = await createOrder(ana, { title: 'Mesmo título' });

      await api(ana.token)
        .patch(`/work-orders/${order.id}`, { title: 'Mesmo título', description: 'Nova' })
        .expect(200);

      expect((await eventsOf(order.id)).at(-1)?.payload).toEqual({
        description: { from: null, to: 'Nova' },
      });
    });

    it('operador não edita ordem de outro (403)', async () => {
      const order = await createOrder(ana);
      await api(bruno.token)
        .patch(`/work-orders/${order.id}`, { title: 'Invadido' })
        .expect(403)
        .expect(errorCode('FORBIDDEN'));
    });

    it.each([
      ['prioridade', { priority: 'URGENT' }],
      ['prazo', { dueDate: inDays(9) }],
    ])('responsável operador não edita %s (403)', async (_name, body) => {
      const order = await createOrder(ana);
      await api(ana.token)
        .patch(`/work-orders/${order.id}`, body)
        .expect(403)
        .expect(errorCode('FORBIDDEN'));
    });

    it('sem aplicação parcial: título e prioridade juntos dão 403 e nada muda', async () => {
      const order = await createOrder(ana, { title: 'Original' });

      await api(ana.token)
        .patch(`/work-orders/${order.id}`, { title: 'Alterado', priority: 'URGENT' })
        .expect(403)
        .expect(errorCode('FORBIDDEN'));

      const current = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(current.title).toBe('Original');
    });

    it('operador enviando a mesma prioridade também recebe 403', async () => {
      const order = await createOrder(ana);
      await api(ana.token)
        .patch(`/work-orders/${order.id}`, { priority: order.priority })
        .expect(403)
        .expect(errorCode('FORBIDDEN'));
    });

    it('supervisor edita todos os campos, e o prazo pode ficar no passado', async () => {
      const order = await createOrder(ana);
      const dueDate = inDays(-2);

      const response = await api(supervisor.token)
        .patch(`/work-orders/${order.id}`, { title: 'Novo', priority: 'URGENT', dueDate })
        .expect(200);

      expect(response.body).toMatchObject({ title: 'Novo', priority: 'URGENT', dueDate });
    });

    it('description null limpa a descrição', async () => {
      const order = await createOrder(ana, { description: 'Texto' });
      const response = await api(ana.token)
        .patch(`/work-orders/${order.id}`, { description: null })
        .expect(200);
      expect((response.body as OrderJson).description).toBeNull();
    });

    it.each(['DONE', 'CANCELLED'])(
      'ordem %s não pode ser editada por ninguém (409)',
      async (end) => {
        const order = await createOrder(ana);
        await setStatus(supervisor, order.id, 'IN_PROGRESS').expect(200);
        await setStatus(supervisor, order.id, end).expect(200);
        const path = `/work-orders/${order.id}`;

        await api(supervisor.token)
          .patch(path, { title: 'Novo título' })
          .expect(409)
          .expect(errorCode('ORDER_FINALIZED'));
        await api(ana.token)
          .patch(path, { title: 'Novo título' })
          .expect(409)
          .expect(errorCode('ORDER_FINALIZED'));
        await api(bruno.token)
          .patch(path, { title: 'Novo título' })
          .expect(409)
          .expect(errorCode('ORDER_FINALIZED'));
      },
    );

    it.each([
      ['corpo vazio', {}],
      ['status no corpo', { status: 'DONE' }],
      ['responsável no corpo', { assigneeId: null }],
      ['título nulo', { title: null }],
      ['prioridade nula', { priority: null }],
      ['prazo nulo', { dueDate: null }],
      ['título curto', { title: 'ab' }],
    ])('400: %s', async (_name, body) => {
      const order = await createOrder(ana);
      await api(supervisor.token)
        .patch(`/work-orders/${order.id}`, body)
        .expect(400)
        .expect(errorCode('VALIDATION_ERROR'));
    });

    it('404 para ordem inexistente', async () => {
      await api(supervisor.token)
        .patch(`/work-orders/${UNKNOWN_ID}`, { title: 'Novo' })
        .expect(404)
        .expect(errorCode('NOT_FOUND'));
    });
  });

  describe('PATCH /work-orders/:id/assignee', () => {
    it('supervisor atribui, com evento ASSIGNED anterior e novo', async () => {
      const order = await createOrder(ana);

      const response = await api(supervisor.token)
        .patch(`/work-orders/${order.id}/assignee`, { assigneeId: bruno.id })
        .expect(200);

      expect((response.body as OrderJson).assignee?.id).toBe(bruno.id);
      expect((await eventsOf(order.id)).at(-1)).toMatchObject({
        type: 'ASSIGNED',
        actorId: supervisor.id,
        payload: { from: ana.id, to: bruno.id },
      });
    });

    it('supervisor remove o responsável com null, mesmo em andamento', async () => {
      const order = await createOrder(ana);
      await setStatus(ana, order.id, 'IN_PROGRESS').expect(200);

      const response = await api(supervisor.token)
        .patch(`/work-orders/${order.id}/assignee`, { assigneeId: null })
        .expect(200);

      expect((response.body as OrderJson).assignee).toBeNull();
      expect((await eventsOf(order.id)).at(-1)?.payload).toEqual({ from: ana.id, to: null });
    });

    it('atribuir o responsável atual não grava evento', async () => {
      const order = await createOrder(ana);
      await api(supervisor.token)
        .patch(`/work-orders/${order.id}/assignee`, { assigneeId: ana.id })
        .expect(200);
      expect(await eventsOf(order.id)).toHaveLength(1);
    });

    it('operador recebe 403, inclusive em ordem própria ou inexistente', async () => {
      const order = await createOrder(ana);
      await api(ana.token)
        .patch(`/work-orders/${order.id}/assignee`, { assigneeId: bruno.id })
        .expect(403)
        .expect(errorCode('FORBIDDEN'));
      await api(ana.token)
        .patch(`/work-orders/${UNKNOWN_ID}/assignee`, { assigneeId: bruno.id })
        .expect(403)
        .expect(errorCode('FORBIDDEN'));
    });

    it('409 em ordem final', async () => {
      const order = await createOrder(ana);
      await setStatus(supervisor, order.id, 'CANCELLED').expect(200);
      await api(supervisor.token)
        .patch(`/work-orders/${order.id}/assignee`, { assigneeId: bruno.id })
        .expect(409)
        .expect(errorCode('ORDER_FINALIZED'));
    });

    it('400 para responsável inexistente, malformado ou ausente; 404 para ordem inexistente', async () => {
      const order = await createOrder(ana);
      const path = `/work-orders/${order.id}/assignee`;
      await api(supervisor.token)
        .patch(path, { assigneeId: UNKNOWN_ID })
        .expect(400)
        .expect(errorCode('VALIDATION_ERROR'))
        .expect((response) =>
          expect((response.body as { details: unknown }).details).toEqual([
            { field: 'assigneeId', messages: ['Responsável não encontrado'] },
          ]),
        );
      await api(supervisor.token)
        .patch(path, { assigneeId: 'abc' })
        .expect(400)
        .expect(errorCode('VALIDATION_ERROR'));
      await api(supervisor.token).patch(path, {}).expect(400).expect(errorCode('VALIDATION_ERROR'));
      await api(supervisor.token)
        .patch(`/work-orders/${UNKNOWN_ID}/assignee`, { assigneeId: bruno.id })
        .expect(404)
        .expect(errorCode('NOT_FOUND'));
    });
  });

  describe('DELETE /work-orders/:id', () => {
    it('operador recebe 403, mesmo sendo o responsável', async () => {
      const order = await createOrder(ana);
      await api(ana.token)
        .delete(`/work-orders/${order.id}`)
        .expect(403)
        .expect(errorCode('FORBIDDEN'));
      expect(await prisma.workOrder.count()).toBe(1);
    });

    it('supervisor exclui, e os eventos saem junto', async () => {
      const order = await createOrder(ana);
      await api(supervisor.token).delete(`/work-orders/${order.id}`).expect(204);

      expect(await prisma.workOrder.count()).toBe(0);
      expect(await eventsOf(order.id)).toHaveLength(0);
    });

    it('supervisor exclui ordem em estado final', async () => {
      const order = await createOrder(ana);
      await setStatus(supervisor, order.id, 'CANCELLED').expect(200);
      await api(supervisor.token).delete(`/work-orders/${order.id}`).expect(204);
    });

    it('404 para ordem inexistente', async () => {
      await api(supervisor.token)
        .delete(`/work-orders/${UNKNOWN_ID}`)
        .expect(404)
        .expect(errorCode('NOT_FOUND'));
    });
  });
});
