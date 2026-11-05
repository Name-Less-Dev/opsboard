import type { WorkOrderStatus } from '../work-orders/labels';
import {
  DEFAULT_LIST_PARAMS,
  serializeListParams,
  type ListParams,
} from '../work-orders/list-params';

// Os atalhos do painel saem dos mesmos `ListParams` que a lista lê da URL: quem conhece o
// formato da query string continua sendo só `list-params.ts`.

function listHref(changes: Partial<ListParams>): string {
  const query = serializeListParams({ ...DEFAULT_LIST_PARAMS, ...changes });
  return query ? `/orders?${query}` : '/orders';
}

export function statusListHref(status: WorkOrderStatus): string {
  return listHref({ status: [status] });
}

/** Atrasadas, prazo mais antigo primeiro (mesma ordem da lista do painel). */
export function overdueListHref(): string {
  return listHref({ overdue: true, sortBy: 'dueDate', order: 'asc' });
}

export function myOpenOrdersHref(): string {
  return listHref({ mine: true, status: ['OPEN', 'IN_PROGRESS'] });
}
