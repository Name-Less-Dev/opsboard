import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcrypt';
import { parse } from 'csv-parse/sync';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { LoginResult } from './../src/auth/auth.service';
import { AppConfig, loadAppConfig } from './../src/config/app-config';
import { PrismaService } from './../src/prisma/prisma.service';
import { EXPORT_COLUMNS } from './../src/work-orders/csv/export-csv';
import { errorCode } from './error-code';
import { getTestDatabaseUrl } from './test-database';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type RowErrorJson = { row: number; column: string | null; code: string; message: string };
type ReportJson = {
  dryRun: true;
  valid: boolean;
  totalRows: number;
  validRows: number;
  totalErrors: number;
  errors: RowErrorJson[];
};

const PASSWORD = 'senha-de-teste';
const HEADER = 'title;description;priority;dueDate;assigneeEmail';
const EXAMPLES = join(__dirname, '../../../docs/examples');
const BOM = String.fromCharCode(0xfeff);
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

/** Corpo cru da resposta, sem decodificar: para conferir BOM e bytes. */
function binary(res: request.Response, done: (error: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
}

const readCsv = (bytes: Buffer): string[][] =>
  parse(bytes.toString('utf8'), { bom: true, delimiter: ';' });

describe('CSV: exportação e importação (integração com banco real)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  // Objeto mutável no lugar do AppConfig: cada teste ajusta os tetos sem subir outra aplicação.
  const config: Mutable<AppConfig> = { ...loadAppConfig(process.env) };
  const defaults = { ...config };
  let supervisor: { id: string; token: string };
  let ana: { id: string; token: string };
  let bruno: { id: string; token: string };

  const server = () => app.getHttpServer();
  const auth = (req: request.Test, token?: string) =>
    token ? req.set('Authorization', `Bearer ${token}`) : req;

  async function createUser(name: string, email: string, role: 'OPERATOR' | 'SUPERVISOR') {
    const passwordHash = await hash(PASSWORD, 4);
    const user = await prisma.user.create({ data: { name, email, role, passwordHash } });
    const login = await request(server())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { id: user.id, token: (login.body as LoginResult).accessToken };
  }

  function exportCsv(query = '', token: string | undefined = supervisor.token) {
    return auth(request(server()).get(`/work-orders/export${query}`), token)
      .buffer(true)
      .parse(binary);
  }

  function upload(
    content: string | Buffer,
    {
      dryRun,
      token = supervisor.token,
      field = 'file',
    }: {
      dryRun?: boolean;
      token?: string;
      field?: string;
    } = {},
  ) {
    const query = dryRun === undefined ? '' : `?dryRun=${dryRun}`;
    const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    return auth(request(server()).post(`/work-orders/import${query}`), token).attach(field, body, {
      filename: 'ordens.csv',
      contentType: 'text/csv',
    });
  }

  const csvFile = (rows: string[], header = HEADER, eol = '\r\n') =>
    [header, ...rows].join(eol) + eol;

  async function counts() {
    return { orders: await prisma.workOrder.count(), events: await prisma.workOrderEvent.count() };
  }

  async function insertOrder(data: {
    title: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    status?: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
    dueDate?: Date;
    description?: string | null;
    assigneeId?: string | null;
  }) {
    return prisma.workOrder.create({
      data: {
        priority: 'MEDIUM',
        dueDate: inDays(5),
        createdById: supervisor.id,
        ...data,
      },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue(config)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = app.get(PrismaService);

    const [{ name }] = await prisma.$queryRaw<
      { name: string }[]
    >`SELECT current_database() AS name`;
    expect(name).toBe(new URL(getTestDatabaseUrl()).pathname.slice(1));
  });

  beforeEach(async () => {
    Object.assign(config, defaults);
    await prisma.$executeRaw`TRUNCATE "WorkOrderEvent", "WorkOrder", "User" CASCADE`;
    // Os mesmos e-mails do seed, que é o que os arquivos de docs/examples usam.
    supervisor = await createUser('Carla Supervisora', 'supervisor@opsboard.dev', 'SUPERVISOR');
    ana = await createUser('Ana Operadora', 'ana@opsboard.dev', 'OPERATOR');
    bruno = await createUser('Bruno Operador', 'bruno@opsboard.dev', 'OPERATOR');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /work-orders/export', () => {
    it('exporta o mesmo conjunto, na mesma ordem, que a lista com os mesmos filtros', async () => {
      await insertOrder({ title: 'Alta aberta 1', priority: 'HIGH', dueDate: inDays(9) });
      await insertOrder({ title: 'Alta aberta 2', priority: 'HIGH', dueDate: inDays(2) });
      await insertOrder({ title: 'Alta em andamento', priority: 'HIGH', status: 'IN_PROGRESS' });
      await insertOrder({ title: 'Alta concluída', priority: 'HIGH', status: 'DONE' });
      await insertOrder({ title: 'Baixa aberta', priority: 'LOW' });
      await insertOrder({ title: 'Urgente do Ana', priority: 'URGENT', assigneeId: ana.id });
      const filters = '?status=OPEN,IN_PROGRESS&priority=HIGH,URGENT&sortBy=dueDate&order=asc';

      const list = await auth(
        request(server()).get(`/work-orders${filters}&pageSize=100`),
        supervisor.token,
      ).expect(200);
      const exported = await exportCsv(filters).expect(200);

      const listIds = (list.body as { items: { id: string }[] }).items.map((item) => item.id);
      const [header, ...rows] = readCsv(exported.body as Buffer);
      expect(header).toEqual([...EXPORT_COLUMNS]);
      expect(rows.map((row) => row[0])).toEqual(listIds);
      expect(rows).toHaveLength(4);
    });

    it('sem filtros exporta tudo, na ordenação padrão da lista (mais recente primeiro)', async () => {
      const first = await insertOrder({ title: 'Primeira' });
      const second = await insertOrder({ title: 'Segunda' });
      const [, ...rows] = readCsv((await exportCsv().expect(200)).body as Buffer);
      expect(rows.map((row) => row[0])).toEqual([second.id, first.id]);
    });

    it('UTF-8 com BOM, `;`, CRLF, rótulos em português e cabeçalhos HTTP de download', async () => {
      await insertOrder({ title: 'Manutenção', priority: 'URGENT', assigneeId: ana.id });
      const response = await exportCsv().expect(200);
      const bytes = response.body as Buffer;

      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const text = bytes.toString('utf8');
      expect(text.startsWith(`${BOM}${EXPORT_COLUMNS.join(';')}\r\n`)).toBe(true);
      expect(text).toContain(';Manutenção;;Urgente;Aberta;');
      expect(text).toContain(';Ana Operadora;Carla Supervisora;');
      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="opsboard-ordens-\d{8}-\d{4}\.csv"$/,
      );
    });

    it('o nome do arquivo usa o horário do APP_TIMEZONE', async () => {
      config.appTimezone = 'Asia/Tokyo';
      const response = await exportCsv().expect(200);
      const stamp = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .format(new Date())
        .replaceAll('-', '');
      expect(response.headers['content-disposition']).toContain(`opsboard-ordens-${stamp}-`);
    });

    it('sem token: 401', async () => {
      await request(server())
        .get('/work-orders/export')
        .expect(401)
        .expect(errorCode('UNAUTHORIZED'));
    });

    it('operador também exporta, e a saída não tem e-mail nem hash', async () => {
      await insertOrder({ title: 'Da Ana', assigneeId: ana.id });
      const text = ((await exportCsv('', ana.token).expect(200)).body as Buffer).toString('utf8');
      expect(text).toContain('Da Ana');
      expect(text).not.toMatch(/@opsboard\.dev/);
      expect(text).not.toContain('$2b$');
    });

    it('escapa `;`, aspas, vírgula e quebra de linha (lido de volta, volta igual)', async () => {
      const title = 'Sala 3; "urgente", hoje';
      const description = 'Linha 1\nLinha 2\r\nLinha 3; com "aspas"';
      await insertOrder({ title, description });
      const [, row] = readCsv((await exportCsv().expect(200)).body as Buffer);
      expect(row[1]).toBe(title);
      expect(row[2]).toBe(description);
      expect(row).toHaveLength(EXPORT_COLUMNS.length);
    });

    it('título com fórmula sai com apóstrofo; o banco continua sem ele', async () => {
      const order = await insertOrder({ title: '=HYPERLINK("x")' });
      const [, row] = readCsv((await exportCsv().expect(200)).body as Buffer);
      expect(row[1]).toBe(`'=HYPERLINK("x")`);
      const stored = await prisma.workOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(stored.title).toBe('=HYPERLINK("x")');
    });

    it('acima de EXPORT_MAX_ROWS: 422 EXPORT_TOO_LARGE; no limite exato, exporta', async () => {
      config.exportMaxRows = 3;
      for (const title of ['Um a', 'Dois', 'Três']) await insertOrder({ title });
      const [, ...rows] = readCsv((await exportCsv().expect(200)).body as Buffer);
      expect(rows).toHaveLength(3);

      await insertOrder({ title: 'Quatro' });
      const response = await auth(
        request(server()).get('/work-orders/export'),
        supervisor.token,
      ).expect(422);
      errorCode('EXPORT_TOO_LARGE')(response);
      expect((response.body as { message: string }).message).toMatch(/filtros/);
      // Com filtro, o mesmo teto deixa passar.
      await exportCsv('?q=Quatro').expect(200);
    });

    it.each([['?page=1'], ['?pageSize=10'], ['?status=OPEN&page=2']])(
      '%s na exportação: 400',
      async (query) => {
        await auth(request(server()).get(`/work-orders/export${query}`), supervisor.token)
          .expect(400)
          .expect(errorCode('VALIDATION_ERROR'));
      },
    );

    it('filtro inválido também dá 400, como na lista', async () => {
      await auth(request(server()).get('/work-orders/export?status=FOO'), supervisor.token)
        .expect(400)
        .expect(errorCode('VALIDATION_ERROR'));
    });
  });

  describe('POST /work-orders/import', () => {
    it('dryRun=true devolve o relatório e não grava nada', async () => {
      const before = await counts();
      const response = await upload(readFileSync(join(EXAMPLES, 'ordens-exemplo.csv')), {
        dryRun: true,
      }).expect(200);
      expect(response.body).toEqual({
        dryRun: true,
        valid: true,
        totalRows: 5,
        validRows: 5,
        totalErrors: 0,
        errors: [],
      });
      expect(await counts()).toEqual(before);
    });

    it('importa o arquivo de exemplo: OPEN, criadas pelo supervisor, responsável resolvido e CREATED com source', async () => {
      const response = await upload(readFileSync(join(EXAMPLES, 'ordens-exemplo.csv')), {
        dryRun: false,
      }).expect(201);
      expect(response.body).toEqual({ dryRun: false, imported: 5 });

      const orders = await prisma.workOrder.findMany({
        include: { events: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(orders).toHaveLength(5);
      for (const order of orders) {
        expect(order.status).toBe('OPEN');
        expect(order.createdById).toBe(supervisor.id);
        expect(order.events).toHaveLength(1);
        expect(order.events[0]).toMatchObject({
          type: 'CREATED',
          actorId: supervisor.id,
          toStatus: 'OPEN',
          payload: expect.objectContaining({ source: 'csv_import' }) as unknown,
        });
      }
      const byTitle = new Map(orders.map((order) => [order.title, order]));
      // `ANA@opsboard.dev` no arquivo: a comparação não diferencia maiúsculas.
      expect(byTitle.get('Consertar vazamento na copa')?.assigneeId).toBe(ana.id);
      expect(byTitle.get('Revisar extintores do 3º andar')?.assigneeId).toBe(bruno.id);
      expect(byTitle.get('Calibrar balança da expedição')?.assigneeId).toBeNull();
      expect(byTitle.get('Revisar extintores do 3º andar')?.priority).toBe('MEDIUM');
      // Só a data: fim do dia em America/Sao_Paulo (UTC-3).
      expect(byTitle.get('Trocar filtro do ar-condicionado da sala 2')?.dueDate.toISOString()).toBe(
        '2099-03-16T02:59:59.999Z',
      );
      expect(byTitle.get('Consertar vazamento na copa')?.dueDate.toISOString()).toBe(
        '2099-01-20T13:00:00.000Z',
      );
      expect(byTitle.get('Inventário do almoxarifado')?.description).toBe(
        'Contar itens das prateleiras A a D.\nRegistrar divergências na planilha do setor.',
      );
    });

    it('sem dryRun, o padrão é importar de verdade', async () => {
      await upload(csvFile(['Ordem padrão;;LOW;2099-01-01;'])).expect(201);
      expect(await prisma.workOrder.count()).toBe(1);
    });

    it('o histórico da ordem importada mostra só a criação, sem details', async () => {
      await upload(csvFile(['Importada;;HIGH;2099-01-01;']), { dryRun: false }).expect(201);
      const { id } = await prisma.workOrder.findFirstOrThrow();
      const response = await auth(
        request(server()).get(`/work-orders/${id}/events`),
        ana.token,
      ).expect(200);
      expect((response.body as { items: object[] }).items).toEqual([
        expect.objectContaining({ type: 'CREATED', details: null, toStatus: 'OPEN' }),
      ]);
    });

    it('prazo só com data segue o APP_TIMEZONE configurado', async () => {
      config.appTimezone = 'UTC';
      await upload(csvFile(['Em UTC;;LOW;2099-03-15;'])).expect(201);
      const order = await prisma.workOrder.findFirstOrThrow();
      expect(order.dueDate.toISOString()).toBe('2099-03-15T23:59:59.999Z');
    });

    it('tudo ou nada: uma linha inválida no meio → 422 e nenhuma ordem ou evento gravado', async () => {
      await insertOrder({ title: 'Já existia' });
      const before = await counts();
      const response = await upload(
        csvFile([
          'Válida um;;LOW;2099-01-01;',
          'Válida dois;;HIGH;2099-01-01;ana@opsboard.dev',
          'Inválida;;Gravíssima;2099-01-01;',
          'Válida três;;URGENT;2099-01-01;',
        ]),
        { dryRun: false },
      ).expect(422);

      errorCode('IMPORT_INVALID')(response);
      expect(response.body).toMatchObject({
        totalErrors: 1,
        details: [
          { row: 4, column: 'priority', code: 'INVALID_ENUM', message: expect.any(String) },
        ],
      });
      expect(await counts()).toEqual(before);
    });

    it('falha do banco no meio da gravação desfaz as ordens já inseridas', async () => {
      // Falha real no Postgres só na 3ª ordem: as duas primeiras já foram inseridas na transação.
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION fail_third_import() RETURNS trigger AS $$
        BEGIN
          IF NEW.title = 'Terceira falha' THEN RAISE EXCEPTION 'falha simulada'; END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER fail_third_import BEFORE INSERT ON "WorkOrder"
        FOR EACH ROW EXECUTE FUNCTION fail_third_import()`);
      try {
        const response = await upload(
          csvFile([
            'Primeira ok;;LOW;2099-01-01;',
            'Segunda ok;;LOW;2099-01-01;',
            'Terceira falha;;LOW;2099-01-01;',
          ]),
          { dryRun: false },
        ).expect(500);
        errorCode('INTERNAL_ERROR')(response);
      } finally {
        await prisma.$executeRawUnsafe('DROP FUNCTION fail_third_import CASCADE');
      }
      expect(await counts()).toEqual({ orders: 0, events: 0 });
    });

    it('cada código de linha, com linha e coluna certas (ordens-com-erros.csv)', async () => {
      const file = readFileSync(join(EXAMPLES, 'ordens-com-erros.csv'));
      const report = (await upload(file, { dryRun: true }).expect(200)).body as ReportJson;

      expect(report).toMatchObject({ valid: false, totalRows: 11, validRows: 2, totalErrors: 10 });
      expect(report.errors.map(({ row, column, code }) => [row, column, code])).toEqual([
        [3, 'title', 'REQUIRED'],
        [4, 'title', 'TOO_SHORT'],
        [5, 'title', 'TOO_LONG'],
        [6, 'priority', 'INVALID_ENUM'],
        [7, 'dueDate', 'INVALID_DATE'],
        [8, 'dueDate', 'INVALID_DATE'],
        [9, 'dueDate', 'DATE_IN_PAST'],
        [10, 'assigneeEmail', 'UNKNOWN_ASSIGNEE'],
        [11, 'priority', 'REQUIRED'],
        [11, 'dueDate', 'REQUIRED'],
      ]);

      // Sem dryRun, a mesma lista vem no 422, e nada é gravado.
      const response = await upload(file, { dryRun: false }).expect(422);
      expect((response.body as { details: RowErrorJson[] }).details).toEqual(report.errors);
      expect(await prisma.workOrder.count()).toBe(0);
    });

    it('relatório limitado a 100 erros, com totalErrors real', async () => {
      const rows = Array.from({ length: 150 }, (_, index) => `Ordem ${index};;X;2099-01-01;`);
      const report = (await upload(csvFile(rows), { dryRun: true }).expect(200)).body as ReportJson;
      expect(report).toMatchObject({ totalRows: 150, validRows: 0, totalErrors: 150 });
      expect(report.errors).toHaveLength(100);
      expect(report.errors.at(-1)?.row).toBe(101);

      const response = await upload(csvFile(rows), { dryRun: false }).expect(422);
      expect(response.body).toMatchObject({ totalErrors: 150 });
      expect((response.body as { details: unknown[] }).details).toHaveLength(100);
    });

    describe('erros do arquivo: 400 IMPORT_FILE_INVALID, nunca 500', () => {
      it.each([
        ['vazio', Buffer.alloc(0), /vazio/],
        ['só o BOM', Buffer.from(BOM, 'utf8'), /vazio/],
        ['cabeçalho sem title', 'description;priority\r\nx;LOW\r\n', /title/],
        ['coluna desconhecida', `${HEADER};status\r\nAbc;;LOW;2099-01-01;;OPEN\r\n`, /status/],
        ['coluna repetida', 'title;priority;title\r\nAbc;LOW;Def\r\n', /mais de uma vez/],
        [
          'Latin-1',
          Buffer.concat([
            Buffer.from('title;priority\r\nManuten'),
            Buffer.from([0xe7, 0xe3]),
            Buffer.from('o;LOW\r\n'),
          ]),
          /UTF-8/,
        ],
        ['CSV malformado (aspas abertas)', `${HEADER}\r\n"Abc;;LOW;2099-01-01;\r\n`, /malformado/],
        ['linha com colunas a mais', `${HEADER}\r\nAbc;;LOW;2099-01-01;;extra\r\n`, /colunas/],
        ['só o cabeçalho', `${HEADER}\r\n`, /cabeçalho/],
      ])('%s', async (_label, content, message) => {
        const response = await upload(content, { dryRun: true }).expect(400);
        errorCode('IMPORT_FILE_INVALID')(response);
        expect((response.body as { message: string }).message).toMatch(message);
      });

      it('mais de IMPORT_MAX_ROWS linhas', async () => {
        config.importMaxRows = 3;
        const rows = (n: number) => Array.from({ length: n }, () => 'Abc;;LOW;2099-01-01;');
        await upload(csvFile(rows(3)), { dryRun: true }).expect(200);
        const response = await upload(csvFile(rows(4)), { dryRun: true }).expect(400);
        errorCode('IMPORT_FILE_INVALID')(response);
        expect((response.body as { message: string }).message).toMatch(/mais de 3/);
      });

      it('campo file ausente (multipart sem arquivo)', async () => {
        const response = await auth(
          request(server()).post('/work-orders/import').field('outro', 'valor'),
          supervisor.token,
        ).expect(400);
        errorCode('IMPORT_FILE_INVALID')(response);
      });

      it('arquivo em outro campo', async () => {
        const response = await upload(csvFile(['Abc;;LOW;2099-01-01;']), { field: 'arquivo' });
        expect(response.status).toBe(400);
        errorCode('IMPORT_FILE_INVALID')(response);
      });

      it('corpo JSON em vez de multipart', async () => {
        const response = await auth(
          request(server()).post('/work-orders/import').send({ file: 'title;priority' }),
          supervisor.token,
        ).expect(400);
        errorCode('IMPORT_FILE_INVALID')(response);
      });

      it('multipart quebrado (fim inesperado)', async () => {
        const response = await auth(
          request(server())
            .post('/work-orders/import')
            .set('Content-Type', 'multipart/form-data; boundary=xyz')
            .send(
              '--xyz\r\nContent-Disposition: form-data; name="file"; filename="a.csv"\r\n\r\ntitle',
            ),
          supervisor.token,
        );
        expect(response.status).toBe(400);
        errorCode('IMPORT_FILE_INVALID')(response);
      });

      it('dryRun com valor inválido: 400 de validação', async () => {
        await auth(request(server()).post('/work-orders/import?dryRun=talvez'), supervisor.token)
          .attach('file', Buffer.from(csvFile(['Abc;;LOW;2099-01-01;'])), 'a.csv')
          .expect(400)
          .expect(errorCode('VALIDATION_ERROR'));
      });
    });

    it('arquivo acima de 1 MB: 413 PAYLOAD_TOO_LARGE, sem gravar', async () => {
      const big = Buffer.alloc(1024 * 1024 + 1, 'a');
      const response = await upload(big, { dryRun: false }).expect(413);
      errorCode('PAYLOAD_TOO_LARGE')(response);
      expect(await prisma.workOrder.count()).toBe(0);
    });

    it('arquivo de exatamente 1 MB passa do limite de tamanho (e cai na validação do CSV)', async () => {
      const filler = Buffer.alloc(1024 * 1024 - Buffer.byteLength(`${HEADER}\r\n`), 'a');
      const response = await upload(Buffer.concat([Buffer.from(`${HEADER}\r\n`), filler]), {
        dryRun: true,
      });
      expect(response.status).not.toBe(413);
    });

    it('operador: 403, sem gravar; sem token: 401', async () => {
      const file = csvFile(['Abc;;LOW;2099-01-01;']);
      await upload(file, { token: ana.token }).expect(403).expect(errorCode('FORBIDDEN'));
      await upload(file, { token: '' }).expect(401).expect(errorCode('UNAUTHORIZED'));
      expect(await prisma.workOrder.count()).toBe(0);
    });

    it.each([
      ['`;` com CRLF e BOM', `${BOM}${csvFile(['Abc;;LOW;2099-01-01;'])}`],
      ['`;` com LF', csvFile(['Abc;;LOW;2099-01-01;'], HEADER, '\n')],
      ['`,` com CRLF', csvFile(['Abc,,LOW,2099-01-01,'], HEADER.replaceAll(';', ','))],
      [
        '`,` com LF e BOM',
        `${BOM}${csvFile(['"A, b",,LOW,2099-01-01,'], HEADER.replaceAll(';', ','), '\n')}`,
      ],
      [
        'cabeçalho em maiúsculas e só as colunas obrigatórias',
        'TITLE;Priority;DUEDATE\nAbc;Baixa;2099-01-01\n',
      ],
    ])('aceita %s', async (_label, content) => {
      const response = await upload(content, { dryRun: false }).expect(201);
      expect(response.body).toEqual({ dryRun: false, imported: 1 });
    });

    it('o conteúdo do arquivo nunca aparece nos logs', async () => {
      const methods = ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const;
      const spies = methods.map((method) =>
        jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined),
      );
      try {
        const secret = 'MARCADOR-SIGILOSO-7f3a';
        const good = csvFile([`${secret} ok;${secret} desc;LOW;2099-01-01;`]);
        const bad = csvFile([`${secret} ruim;;Nenhuma;2099-01-01;${secret}@x.dev`]);
        await upload(good, { dryRun: true }).expect(200);
        await upload(good, { dryRun: false }).expect(201);
        await upload(bad, { dryRun: false }).expect(422);
        await upload(`${HEADER};${secret}\r\n`, { dryRun: true }).expect(400);

        const logged = spies
          .flatMap((spy) => spy.mock.calls)
          .flat()
          .map(String)
          .join('\n');
        expect(logged).toContain('POST /work-orders/import');
        expect(logged).not.toContain(secret);
        expect(logged).not.toContain('title;description');
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });
  });
});
