import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api';
import { dashboardKeys } from './dashboard-keys';
import type { DashboardSummary } from './summary';

/** Por 30 s o painel é servido do cache ao voltar para a tela; depois, busca de novo. */
export const DASHBOARD_STALE_TIME_MS = 30_000;

// Retry e `refetchOnWindowFocus` vêm do padrão do app (lib/query-client.ts): no máximo uma
// nova tentativa, só em falha de rede ou 5xx. Sem polling: atualiza ao montar a tela (se o
// cache passou de 30 s), pelo botão "Atualizar" ou quando uma mutação invalida a chave.
export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: ({ signal }) => apiGet<DashboardSummary>('/dashboard/summary', signal),
    staleTime: DASHBOARD_STALE_TIME_MS,
  });
}
