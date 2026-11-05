import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../lib/api';
import { workOrderKeys } from '../use-work-orders';
import type { WorkOrderEventPage } from './history-types';

/** Itens por página da linha do tempo. */
export const HISTORY_PAGE_SIZE = 10;

// Retry e `refetchOnWindowFocus` vêm do padrão do app (lib/query-client.ts): no máximo uma nova
// tentativa, só em falha de rede ou 5xx. A página fica no estado da seção, não na URL.
export function useWorkOrderHistory(orderId: string, page: number) {
  return useQuery({
    queryKey: workOrderKeys.historyPage(orderId, page),
    queryFn: ({ signal }) =>
      apiGet<WorkOrderEventPage>(
        `/work-orders/${orderId}/events?page=${page}&pageSize=${HISTORY_PAGE_SIZE}`,
        signal,
      ),
    // Mantém a página anterior na tela enquanto a próxima carrega.
    placeholderData: keepPreviousData,
  });
}
