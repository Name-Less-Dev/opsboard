import { PRIORITIES, STATUSES, type WorkOrderPriority, type WorkOrderStatus } from './labels';

// A query string é a fonte da verdade da lista. Estas funções são o único lugar que conhece
// o formato da URL e o da API; a tela só lida com `ListParams`.

export const SORT_FIELDS = ['createdAt', 'updatedAt', 'dueDate', 'priority'] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

/** Data local no formato AAAA-MM-DD, como a do `<input type="date">`. */
export type LocalDate = string;

export type ListParams = {
  /** Sem espaços nas pontas; '' = sem busca. */
  q: string;
  /** Sem repetidos, na ordem do enum (assim URLs equivalentes dão a mesma chave de cache). */
  status: WorkOrderStatus[];
  priority: WorkOrderPriority[];
  /** "Minhas ordens": `assignee=me` na URL, `assigneeId=me` na API. */
  mine: boolean;
  overdue: boolean;
  dueFrom: LocalDate | null;
  dueTo: LocalDate | null;
  sortBy: SortField;
  order: SortOrder;
  page: number;
  pageSize: number;
};

export const MAX_QUERY_LENGTH = 100;
export const MAX_PAGE_SIZE = 100;

export const DEFAULT_LIST_PARAMS: ListParams = {
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
};

/** O que conta como filtro: tudo menos ordenação e paginação. */
export type ListFilters = Omit<ListParams, 'page' | 'pageSize'>;

function isOneOf<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && (values as readonly string[]).includes(value);
}

// Junta `status=A,B` e `status=A&status=B`, descarta vazios, repetidos e valores fora do enum,
// e devolve na ordem do enum.
function parseList<T extends string>(search: URLSearchParams, key: string, allowed: readonly T[]) {
  const given = new Set(
    search
      .getAll(key)
      .flatMap((value) => value.split(','))
      .map((value) => value.trim()),
  );
  return allowed.filter((value) => given.has(value));
}

function parsePositiveInt(value: string | null, max = Number.MAX_SAFE_INTEGER): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= max ? number : null;
}

function parseLocalDate(value: string | null): LocalDate | null {
  const match = value === null ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  // Em UTC só para validar o calendário (2026-02-30 "transborda" para março).
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? value : null;
}

function parseQuery(value: string | null): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length <= MAX_QUERY_LENGTH ? trimmed : '';
}

export function parseListParams(search: URLSearchParams): ListParams {
  const sortBy = search.get('sortBy');
  const order = search.get('order');
  return {
    q: parseQuery(search.get('q')),
    status: parseList(search, 'status', STATUSES),
    priority: parseList(search, 'priority', PRIORITIES),
    mine: search.get('assignee') === 'me',
    overdue: search.get('overdue') === 'true',
    dueFrom: parseLocalDate(search.get('dueFrom')),
    dueTo: parseLocalDate(search.get('dueTo')),
    sortBy: isOneOf(SORT_FIELDS, sortBy) ? sortBy : DEFAULT_LIST_PARAMS.sortBy,
    order: isOneOf(SORT_ORDERS, order) ? order : DEFAULT_LIST_PARAMS.order,
    page: parsePositiveInt(search.get('page')) ?? DEFAULT_LIST_PARAMS.page,
    pageSize:
      parsePositiveInt(search.get('pageSize'), MAX_PAGE_SIZE) ?? DEFAULT_LIST_PARAMS.pageSize,
  };
}

/**
 * Query string sem `?`, omitindo os valores padrão, sempre na mesma ordem. Monta o texto à
 * mão porque o `URLSearchParams` escaparia a vírgula das listas (`OPEN%2CDONE`).
 */
export function serializeListParams(params: ListParams): string {
  const d = DEFAULT_LIST_PARAMS;
  const entries: [string, string | null][] = [
    ['q', params.q || null],
    ['status', params.status.join(',') || null],
    ['priority', params.priority.join(',') || null],
    ['assignee', params.mine ? 'me' : null],
    ['overdue', params.overdue ? 'true' : null],
    ['dueFrom', params.dueFrom],
    ['dueTo', params.dueTo],
    ['sortBy', params.sortBy !== d.sortBy ? params.sortBy : null],
    ['order', params.order !== d.order ? params.order : null],
    ['page', params.page !== d.page ? String(params.page) : null],
    ['pageSize', params.pageSize !== d.pageSize ? String(params.pageSize) : null],
  ];
  return entries
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([key, value]) =>
      key === 'status' || key === 'priority'
        ? `${key}=${value}`
        : `${key}=${encodeURIComponent(value)}`,
    )
    .join('&');
}

// `new Date(ano, mês, dia, ...)` interpreta no fuso do navegador; `toISOString` devolve o mesmo
// instante em UTC, que é o que a API compara.
function localDayBoundary(date: LocalDate, edge: 'start' | 'end'): string {
  const [year, month, day] = date.split('-').map(Number);
  const instant =
    edge === 'start'
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  return instant.toISOString();
}

/** Query de `GET /work-orders`. Paginação e ordenação vão sempre explícitas. */
export function toApiQuery(params: ListParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status.length) query.set('status', params.status.join(','));
  if (params.priority.length) query.set('priority', params.priority.join(','));
  if (params.mine) query.set('assigneeId', 'me');
  if (params.overdue) query.set('overdue', 'true');
  if (params.dueFrom) query.set('dueFrom', localDayBoundary(params.dueFrom, 'start'));
  if (params.dueTo) query.set('dueTo', localDayBoundary(params.dueTo, 'end'));
  query.set('page', String(params.page));
  query.set('pageSize', String(params.pageSize));
  query.set('sortBy', params.sortBy);
  query.set('order', params.order);
  return query;
}

/** Qualquer mudança de filtro ou ordenação volta para a página 1. */
export function withFilters(params: ListParams, changes: Partial<ListFilters>): ListParams {
  return { ...params, ...changes, page: 1 };
}

export function withPage(params: ListParams, page: number): ListParams {
  return { ...params, page };
}

/** Limpa filtros e busca; mantém ordenação e tamanho de página. */
export function clearFilters(params: ListParams): ListParams {
  return {
    ...DEFAULT_LIST_PARAMS,
    sortBy: params.sortBy,
    order: params.order,
    pageSize: params.pageSize,
  };
}

export function hasActiveFilters(params: ListParams): boolean {
  return (
    params.q !== '' ||
    params.status.length > 0 ||
    params.priority.length > 0 ||
    params.mine ||
    params.overdue ||
    params.dueFrom !== null ||
    params.dueTo !== null
  );
}

/** "De" depois de "até": a API recusaria (400), então a tela avisa e não consulta. */
export function isDueRangeInvalid(params: ListParams): boolean {
  // AAAA-MM-DD ordena como texto na mesma ordem das datas.
  return params.dueFrom !== null && params.dueTo !== null && params.dueFrom > params.dueTo;
}
