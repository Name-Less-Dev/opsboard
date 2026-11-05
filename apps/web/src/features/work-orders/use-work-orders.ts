import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api';
import type { WorkOrderPage } from './labels';
import { isDueRangeInvalid, toApiQuery, type ListParams } from './list-params';

export const workOrderKeys = {
  all: ['work-orders'] as const,
  /** Prefixo de todas as páginas da lista, com quaisquer filtros: é o que se invalida. */
  lists: () => [...workOrderKeys.all, 'list'] as const,
  // Os próprios filtros são a chave: o TanStack Query compara por valor, e `status` e
  // `priority` já vêm normalizados (ordem do enum), então URLs equivalentes dividem o cache.
  list: (params: ListParams) => [...workOrderKeys.lists(), params] as const,
  detail: (id: string) => [...workOrderKeys.all, 'detail', id] as const,
  /** Todas as páginas do histórico de uma ordem: é o que se invalida ou remove. */
  history: (id: string) => [...workOrderKeys.all, 'history', id] as const,
  historyPage: (id: string, page: number) => [...workOrderKeys.history(id), page] as const,
};

export function useWorkOrders(params: ListParams) {
  return useQuery({
    queryKey: workOrderKeys.list(params),
    queryFn: ({ signal }) =>
      apiGet<WorkOrderPage>(`/work-orders?${toApiQuery(params).toString()}`, signal),
    // Mantém a página anterior na tela enquanto a próxima carrega, sem piscar o skeleton.
    placeholderData: keepPreviousData,
    // "De" depois de "até": a API responderia 400; a tela mostra o erro no campo.
    enabled: !isDueRangeInvalid(params),
  });
}
