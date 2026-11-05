import { describe, expect, it } from 'vitest';
import { STATUSES } from '../work-orders/labels';
import { DEFAULT_LIST_PARAMS, parseListParams } from '../work-orders/list-params';
import { myOpenOrdersHref, overdueListHref, statusListHref } from './dashboard-links';

/** Interpreta o link como a lista interpretaria a URL. */
function parseHref(href: string) {
  const url = new URL(href, 'http://localhost');
  expect(url.pathname).toBe('/orders');
  return parseListParams(url.searchParams);
}

describe('links do painel para a lista', () => {
  it.each(STATUSES)('status %s → lista filtrada só por esse status', (status) => {
    expect(parseHref(statusListHref(status))).toEqual({ ...DEFAULT_LIST_PARAMS, status: [status] });
  });

  it('formato da URL do status', () => {
    expect(statusListHref('IN_PROGRESS')).toBe('/orders?status=IN_PROGRESS');
  });

  it('atrasadas → overdue, prazo mais antigo primeiro', () => {
    expect(overdueListHref()).toBe('/orders?overdue=true&sortBy=dueDate&order=asc');
    expect(parseHref(overdueListHref())).toEqual({
      ...DEFAULT_LIST_PARAMS,
      overdue: true,
      sortBy: 'dueDate',
      order: 'asc',
    });
  });

  it('minhas ordens em aberto → assignee=me com abertas e em andamento', () => {
    expect(myOpenOrdersHref()).toBe('/orders?status=OPEN,IN_PROGRESS&assignee=me');
    expect(parseHref(myOpenOrdersHref())).toEqual({
      ...DEFAULT_LIST_PARAMS,
      mine: true,
      status: ['OPEN', 'IN_PROGRESS'],
    });
  });
});
