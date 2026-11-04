import { describe, expect, it } from 'vitest';
import {
  clearFilters,
  DEFAULT_LIST_PARAMS,
  hasActiveFilters,
  isDueRangeInvalid,
  parseListParams,
  serializeListParams,
  toApiQuery,
  withFilters,
  withPage,
  type ListParams,
} from './list-params';

const parse = (query: string) => parseListParams(new URLSearchParams(query));
const params = (changes: Partial<ListParams>): ListParams => ({
  ...DEFAULT_LIST_PARAMS,
  ...changes,
});

describe('parseListParams', () => {
  it('URL vazia dá os padrões', () => {
    expect(parse('')).toEqual({
      q: '',
      status: [],
      priority: [],
      mine: false,
      overdue: false,
      dueFrom: null,
      dueTo: null,
      sortBy: 'createdAt',
      order: 'desc',
      page: 1,
      pageSize: 20,
    });
  });

  it('lê todos os parâmetros válidos', () => {
    expect(
      parse(
        'q=vazamento&status=OPEN,DONE&priority=HIGH&assignee=me&overdue=true' +
          '&dueFrom=2026-11-01&dueTo=2026-11-30&sortBy=dueDate&order=asc&page=3&pageSize=50',
      ),
    ).toEqual({
      q: 'vazamento',
      status: ['OPEN', 'DONE'],
      priority: ['HIGH'],
      mine: true,
      overdue: true,
      dueFrom: '2026-11-01',
      dueTo: '2026-11-30',
      sortBy: 'dueDate',
      order: 'asc',
      page: 3,
      pageSize: 50,
    });
  });

  it.each([
    ['vírgula', 'status=OPEN,IN_PROGRESS', ['OPEN', 'IN_PROGRESS']],
    ['parâmetro repetido', 'status=OPEN&status=DONE', ['OPEN', 'DONE']],
    ['repetidos ignorados', 'status=OPEN,OPEN,DONE,OPEN', ['OPEN', 'DONE']],
    ['fora do enum ignorados', 'status=OPEN,LATE,open,DONE', ['OPEN', 'DONE']],
    ['itens vazios e espaços', 'status=,OPEN, DONE ,', ['OPEN', 'DONE']],
    ['ordem do enum, não da URL', 'status=CANCELLED,OPEN', ['OPEN', 'CANCELLED']],
    ['só inválidos vira lista vazia', 'status=FOO,BAR', []],
  ])('status: %s', (_name, query, expected) => {
    expect(parse(query).status).toEqual(expected);
  });

  it.each([
    ['vírgula e ordem do enum', 'priority=URGENT,LOW', ['LOW', 'URGENT']],
    ['repetidos e fora do enum', 'priority=HIGH,HIGH,CRITICAL', ['HIGH']],
  ])('priority: %s', (_name, query, expected) => {
    expect(parse(query).priority).toEqual(expected);
  });

  it.each([
    ['zero', 'page=0'],
    ['negativa', 'page=-2'],
    ['decimal', 'page=1.5'],
    ['texto', 'page=abc'],
    ['vazia', 'page='],
    ['notação científica', 'page=1e3'],
    ['além do inteiro seguro', 'page=99999999999999999999'],
  ])('page inválida (%s) vira 1', (_name, query) => {
    expect(parse(query).page).toBe(1);
  });

  it.each([
    ['zero', 'pageSize=0'],
    ['acima do máximo da API', 'pageSize=101'],
    ['texto', 'pageSize=muitos'],
  ])('pageSize inválido (%s) vira 20', (_name, query) => {
    expect(parse(query).pageSize).toBe(20);
  });

  it.each<[string, string, Partial<ListParams>]>([
    ['sortBy fora da lista', 'sortBy=title', { sortBy: 'createdAt' }],
    ['order fora da lista', 'order=up', { order: 'desc' }],
    ['assignee diferente de me', 'assignee=3f6c1d2e-8a4b-4c7d-9e0f-1a2b3c4d5e6f', { mine: false }],
    ['overdue diferente de true', 'overdue=1', { overdue: false }],
    ['overdue=false', 'overdue=false', { overdue: false }],
    ['data em outro formato', 'dueFrom=01/11/2026', { dueFrom: null }],
    ['data com hora', 'dueTo=2026-11-30T10:00:00Z', { dueTo: null }],
    ['data inexistente', 'dueFrom=2026-02-30', { dueFrom: null }],
    ['mês 13', 'dueTo=2026-13-01', { dueTo: null }],
  ])('descarta valor inválido: %s', (_name, query, expected) => {
    expect(parse(query)).toEqual(params(expected));
  });

  it.each([
    ['aparas nas pontas', 'q=%20%20bomba%20d%C3%A1gua%20%20', 'bomba dágua'],
    ['só espaços vira vazio', 'q=%20%20%20', ''],
    ['acima de 100 caracteres é descartado', `q=${'a'.repeat(101)}`, ''],
    ['exatamente 100 caracteres é aceito', `q=${'a'.repeat(100)}`, 'a'.repeat(100)],
  ])('q: %s', (_name, query, expected) => {
    expect(parse(query).q).toBe(expected);
  });

  it('ignora parâmetros desconhecidos', () => {
    expect(parse('foo=bar&assigneeId=me')).toEqual(DEFAULT_LIST_PARAMS);
  });

  it('mantém "de" depois de "até" (a tela mostra o erro, não descarta)', () => {
    const result = parse('dueFrom=2026-12-01&dueTo=2026-11-01');
    expect([result.dueFrom, result.dueTo]).toEqual(['2026-12-01', '2026-11-01']);
    expect(isDueRangeInvalid(result)).toBe(true);
  });
});

describe('serializeListParams', () => {
  it('omite tudo que é padrão (URL limpa)', () => {
    expect(serializeListParams(DEFAULT_LIST_PARAMS)).toBe('');
  });

  it('ordem estável dos parâmetros, vírgula sem escape e texto codificado', () => {
    expect(
      serializeListParams(
        params({
          pageSize: 50,
          page: 2,
          order: 'asc',
          sortBy: 'priority',
          dueTo: '2026-11-30',
          dueFrom: '2026-11-01',
          overdue: true,
          mine: true,
          priority: ['LOW', 'URGENT'],
          status: ['OPEN', 'DONE'],
          q: 'água & sabão',
        }),
      ),
    ).toBe(
      'q=%C3%A1gua%20%26%20sab%C3%A3o&status=OPEN,DONE&priority=LOW,URGENT&assignee=me' +
        '&overdue=true&dueFrom=2026-11-01&dueTo=2026-11-30&sortBy=priority&order=asc' +
        '&page=2&pageSize=50',
    );
  });

  it.each([
    ['só o sentido', { order: 'asc' } as const, 'order=asc'],
    ['só o campo', { sortBy: 'dueDate' } as const, 'sortBy=dueDate'],
    ['só a página', { page: 4 }, 'page=4'],
  ])('escreve só o que difere do padrão: %s', (_name, changes, expected) => {
    expect(serializeListParams(params(changes))).toBe(expected);
  });
});

describe('ida e volta: parse(serialize(x)) devolve x', () => {
  it.each<[string, Partial<ListParams>]>([
    ['padrão', {}],
    ['busca com acentos e símbolos', { q: 'ç ã & = ? # % + , /' }],
    ['listas', { status: ['IN_PROGRESS', 'CANCELLED'], priority: ['MEDIUM', 'HIGH', 'URGENT'] }],
    ['todos os status', { status: ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] }],
    ['booleanos', { mine: true, overdue: true }],
    ['datas', { dueFrom: '2026-01-01', dueTo: '2026-12-31' }],
    ['só uma das datas', { dueTo: '2026-02-28' }],
    ['ordenação e paginação', { sortBy: 'updatedAt', order: 'asc', page: 7, pageSize: 100 }],
    [
      'tudo junto',
      {
        q: 'bomba',
        status: ['OPEN'],
        priority: ['LOW'],
        mine: true,
        overdue: true,
        dueFrom: '2026-11-01',
        dueTo: '2026-11-01',
        sortBy: 'priority',
        order: 'asc',
        page: 2,
        pageSize: 1,
      },
    ],
  ])('%s', (_name, changes) => {
    const x = params(changes);
    expect(parseListParams(new URLSearchParams(serializeListParams(x)))).toEqual(x);
  });
});

describe('toApiQuery', () => {
  const api = (changes: Partial<ListParams>) => Object.fromEntries(toApiQuery(params(changes)));

  it('padrão: só paginação e ordenação, sempre explícitas', () => {
    expect(api({})).toEqual({ page: '1', pageSize: '20', sortBy: 'createdAt', order: 'desc' });
  });

  it('traduz os nomes da URL para os da API', () => {
    expect(
      api({
        q: 'bomba',
        status: ['OPEN', 'DONE'],
        priority: ['URGENT'],
        mine: true,
        overdue: true,
        page: 2,
      }),
    ).toEqual({
      q: 'bomba',
      status: 'OPEN,DONE',
      priority: 'URGENT',
      assigneeId: 'me',
      overdue: 'true',
      page: '2',
      pageSize: '20',
      sortBy: 'createdAt',
      order: 'desc',
    });
  });

  // Testes rodam em America/Sao_Paulo (UTC-3, sem horário de verão).
  it.each([
    [
      '"de" vira o início do dia local',
      { dueFrom: '2026-11-04' },
      'dueFrom',
      '2026-11-04T03:00:00.000Z',
    ],
    ['"até" vira o fim do dia local', { dueTo: '2026-11-04' }, 'dueTo', '2026-11-05T02:59:59.999Z'],
    ['virada de ano', { dueTo: '2026-12-31' }, 'dueTo', '2027-01-01T02:59:59.999Z'],
    ['ano bissexto', { dueFrom: '2028-02-29' }, 'dueFrom', '2028-02-29T03:00:00.000Z'],
  ])('%s', (_name, changes, key, expected) => {
    expect(api(changes)[key]).toBe(expected);
  });

  it('mesmo dia em "de" e "até" cobre o dia local inteiro', () => {
    const query = api({ dueFrom: '2026-11-04', dueTo: '2026-11-04' });
    expect([query.dueFrom, query.dueTo]).toEqual([
      '2026-11-04T03:00:00.000Z',
      '2026-11-05T02:59:59.999Z',
    ]);
  });
});

describe('mudanças de filtro e de página', () => {
  const current = params({
    q: 'bomba',
    status: ['OPEN'],
    sortBy: 'dueDate',
    page: 5,
    pageSize: 50,
  });

  it.each<[string, Partial<ListParams>]>([
    ['busca', { q: 'vazamento' }],
    ['status', { status: ['OPEN', 'DONE'] }],
    ['prioridade', { priority: ['HIGH'] }],
    ['minhas ordens', { mine: true }],
    ['atrasadas', { overdue: true }],
    ['prazo de', { dueFrom: '2026-11-01' }],
    ['prazo até', { dueTo: '2026-11-30' }],
    ['campo de ordenação', { sortBy: 'priority' }],
    ['sentido da ordenação', { order: 'asc' }],
  ])('mudar %s volta para a página 1 e mantém o resto', (_name, changes) => {
    expect(withFilters(current, changes)).toEqual({ ...current, ...changes, page: 1 });
  });

  it('mudar só a página não mexe nos filtros', () => {
    expect(withPage(current, 2)).toEqual({ ...current, page: 2 });
  });

  it('limpar filtros mantém ordenação e tamanho de página, e volta para a página 1', () => {
    const all = params({
      q: 'x',
      status: ['OPEN'],
      priority: ['LOW'],
      mine: true,
      overdue: true,
      dueFrom: '2026-11-01',
      dueTo: '2026-11-30',
      sortBy: 'priority',
      order: 'asc',
      page: 3,
      pageSize: 50,
    });
    expect(clearFilters(all)).toEqual(params({ sortBy: 'priority', order: 'asc', pageSize: 50 }));
  });
});

describe('hasActiveFilters', () => {
  it.each<[string, Partial<ListParams>, boolean]>([
    ['nenhum', {}, false],
    [
      'só ordenação e página não contam',
      { sortBy: 'priority', order: 'asc', page: 3, pageSize: 50 },
      false,
    ],
    ['busca', { q: 'x' }, true],
    ['status', { status: ['DONE'] }, true],
    ['prioridade', { priority: ['LOW'] }, true],
    ['minhas ordens', { mine: true }, true],
    ['atrasadas', { overdue: true }, true],
    ['prazo de', { dueFrom: '2026-11-01' }, true],
    ['prazo até', { dueTo: '2026-11-01' }, true],
  ])('%s', (_name, changes, expected) => {
    expect(hasActiveFilters(params(changes))).toBe(expected);
  });
});

describe('isDueRangeInvalid', () => {
  it.each<[string, Partial<ListParams>, boolean]>([
    ['sem datas', {}, false],
    ['só "de"', { dueFrom: '2026-11-01' }, false],
    ['mesmo dia', { dueFrom: '2026-11-01', dueTo: '2026-11-01' }, false],
    ['"de" antes de "até"', { dueFrom: '2026-11-01', dueTo: '2026-11-02' }, false],
    ['"de" depois de "até"', { dueFrom: '2026-11-02', dueTo: '2026-11-01' }, true],
  ])('%s', (_name, changes, expected) => {
    expect(isDueRangeInvalid(params(changes))).toBe(expected);
  });
});
