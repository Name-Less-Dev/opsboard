import type { Prisma } from '../generated/prisma/client';
import {
  buildWorkOrderOrderBy,
  buildWorkOrderWhere,
  countPages,
  escapeLike,
  normalizeSearch,
  overdueWhere,
  parseList,
  type WorkOrderFilters,
} from './work-order-query';

const NOW = new Date('2026-11-03T12:00:00.000Z');
const ACTOR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ctx = { actorId: ACTOR, now: NOW };

const OVERDUE: Prisma.WorkOrderWhereInput = {
  status: { in: ['OPEN', 'IN_PROGRESS'] },
  dueDate: { lt: NOW },
};
const search = (contains: string): Prisma.WorkOrderWhereInput => ({
  OR: [
    { title: { contains, mode: 'insensitive' } },
    { description: { contains, mode: 'insensitive' } },
  ],
});

describe('parseList', () => {
  it.each([
    ['um valor', 'OPEN', ['OPEN']],
    ['vários valores', 'OPEN,IN_PROGRESS', ['OPEN', 'IN_PROGRESS']],
    ['espaços ao redor', ' OPEN , IN_PROGRESS ', ['OPEN', 'IN_PROGRESS']],
    ['valor repetido', 'OPEN,OPEN,DONE', ['OPEN', 'DONE']],
    ['repetido com espaço', 'OPEN, OPEN', ['OPEN']],
    ['vírgula sobrando', 'OPEN,', ['OPEN']],
    ['só vírgulas e espaços', ' , ,', []],
    ['vazio', '', []],
    ['parâmetro repetido (array)', ['OPEN', 'DONE,OPEN'], ['OPEN', 'DONE']],
  ])('%s', (_name, input, expected) => {
    expect(parseList(input)).toEqual(expected);
  });

  it('não converte o que não é texto; o DTO rejeita depois', () => {
    const nested = { a: 1 };
    expect(parseList(nested)).toBe(nested);
    expect(parseList(['OPEN', 2])).toEqual(['OPEN', 2]);
  });

  it('não valida o enum: valor desconhecido passa adiante para o DTO', () => {
    expect(parseList('OPEN,PAUSED')).toEqual(['OPEN', 'PAUSED']);
  });
});

describe('normalizeSearch', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['   ', undefined],
    ['  filtro  ', 'filtro'],
    ['Filtro de AR', 'Filtro de AR'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeSearch(input)).toBe(expected);
  });
});

describe('escapeLike', () => {
  it.each([
    ['texto comum', 'texto comum'],
    ['50%', '50\\%'],
    ['A_B', 'A\\_B'],
    ['C:\\temp', 'C:\\\\temp'],
    ['%_\\', '\\%\\_\\\\'],
  ])('%j → %j', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});

describe('overdueWhere', () => {
  it('só ativas e com prazo estritamente antes de agora (prazo igual a agora não conta)', () => {
    expect(overdueWhere(NOW)).toEqual(OVERDUE);
  });

  it('usa o instante recebido, não o relógio da máquina', () => {
    const past = new Date('2000-01-01T00:00:00.000Z');
    expect(overdueWhere(past)).toEqual({ ...OVERDUE, dueDate: { lt: past } });
  });
});

describe('buildWorkOrderWhere', () => {
  const FROM = new Date('2026-11-01T00:00:00.000Z');
  const TO = new Date('2026-11-30T23:59:59.000Z');

  it('sem filtros não restringe nada', () => {
    expect(buildWorkOrderWhere({}, ctx)).toEqual({});
  });

  it.each<[string, WorkOrderFilters, Prisma.WorkOrderWhereInput[]]>([
    ['um status', { status: ['OPEN'] }, [{ status: { in: ['OPEN'] } }]],
    [
      'vários status (OR)',
      { status: ['OPEN', 'IN_PROGRESS'] },
      [{ status: { in: ['OPEN', 'IN_PROGRESS'] } }],
    ],
    ['prioridade', { priority: ['HIGH', 'URGENT'] }, [{ priority: { in: ['HIGH', 'URGENT'] } }]],
    ['responsável por UUID', { assigneeId: OTHER }, [{ assigneeId: OTHER }]],
    ['responsável "me" vira o id do usuário', { assigneeId: 'me' }, [{ assigneeId: ACTOR }]],
    ['overdue=true', { overdue: true }, [OVERDUE]],
    ['prazo a partir de', { dueFrom: FROM }, [{ dueDate: { gte: FROM, lte: undefined } }]],
    ['prazo até', { dueTo: TO }, [{ dueDate: { gte: undefined, lte: TO } }]],
    [
      'intervalo de prazo inclusivo',
      { dueFrom: FROM, dueTo: TO },
      [{ dueDate: { gte: FROM, lte: TO } }],
    ],
    ['busca em título e descrição, sem caixa', { q: 'Filtro' }, [search('Filtro')]],
    ['busca com trim', { q: '  filtro  ' }, [search('filtro')]],
    ['busca com curingas escapados', { q: '50%_off' }, [search('50\\%\\_off')]],
  ])('filtro isolado: %s', (_name, filters, expected) => {
    expect(buildWorkOrderWhere(filters, ctx)).toEqual({ AND: expected });
  });

  it.each<[string, WorkOrderFilters]>([
    ['overdue=false', { overdue: false }],
    ['q vazio', { q: '' }],
    ['q só com espaços', { q: '   ' }],
    ['lista de status vazia', { status: [] }],
    ['lista de prioridades vazia', { priority: [] }],
  ])('não filtra: %s', (_name, filters) => {
    expect(buildWorkOrderWhere(filters, ctx)).toEqual({});
  });

  it('combina filtros diferentes com AND, na ordem fixa', () => {
    expect(
      buildWorkOrderWhere(
        { status: ['OPEN'], priority: ['URGENT'], assigneeId: 'me', q: 'porta' },
        ctx,
      ),
    ).toEqual({
      AND: [
        { status: { in: ['OPEN'] } },
        { priority: { in: ['URGENT'] } },
        { assigneeId: ACTOR },
        search('porta'),
      ],
    });
  });

  it('overdue e intervalo de prazo no mesmo campo não se sobrescrevem', () => {
    const where = buildWorkOrderWhere({ overdue: true, dueFrom: FROM, dueTo: TO }, ctx);
    expect(where).toEqual({ AND: [OVERDUE, { dueDate: { gte: FROM, lte: TO } }] });
  });

  it('status explícito e overdue convivem: os dois precisam valer', () => {
    const where = buildWorkOrderWhere({ status: ['IN_PROGRESS'], overdue: true }, ctx);
    expect(where).toEqual({ AND: [{ status: { in: ['IN_PROGRESS'] } }, OVERDUE] });
  });
});

describe('buildWorkOrderOrderBy', () => {
  it('padrão: createdAt desc, com id desc no desempate', () => {
    expect(buildWorkOrderOrderBy()).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it.each([
    ['createdAt', 'asc'],
    ['createdAt', 'desc'],
    ['updatedAt', 'asc'],
    ['updatedAt', 'desc'],
    ['dueDate', 'asc'],
    ['dueDate', 'desc'],
    ['priority', 'asc'],
    ['priority', 'desc'],
  ] as const)('%s %s, sempre com id no mesmo sentido no fim', (sortBy, order) => {
    expect(buildWorkOrderOrderBy(sortBy, order)).toEqual([{ [sortBy]: order }, { id: order }]);
  });
});

describe('countPages', () => {
  it.each([
    [0, 20, 0],
    [1, 20, 1],
    [20, 20, 1],
    [21, 20, 2],
    [5000, 100, 50],
    [5001, 100, 51],
  ])('total %i com pageSize %i → %i páginas', (total, pageSize, expected) => {
    expect(countPages(total, pageSize)).toBe(expected);
  });
});
