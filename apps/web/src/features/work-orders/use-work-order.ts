import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';
import type { components } from '../../lib/api-types';
import { dashboardKeys } from '../dashboard/dashboard-keys';
import type { WorkOrder, WorkOrderStatus } from './labels';
import type { UpdateWorkOrderPayload } from './update-payload';
import { workOrderKeys } from './use-work-orders';

export type CreateWorkOrderPayload = components['schemas']['CreateWorkOrderDto'];

export function useWorkOrder(id: string) {
  return useQuery({
    queryKey: workOrderKeys.detail(id),
    queryFn: ({ signal }) => apiGet<WorkOrder>(`/work-orders/${id}`, signal),
  });
}

// Sem atualização otimista: a tela espera a resposta da API. No sucesso, a lista (todas as
// páginas e filtros), o painel, o detalhe e o histórico daquela ordem ficam velhos e são
// buscados de novo quando aparecerem (o histórico na tela, na hora: ganhou um evento).
function invalidateOrder(queryClient: QueryClient, id: string) {
  return Promise.all([
    invalidateCollections(queryClient),
    queryClient.invalidateQueries({ queryKey: workOrderKeys.detail(id) }),
    queryClient.invalidateQueries({ queryKey: workOrderKeys.history(id) }),
  ]);
}

/** O que muda com qualquer ordem: a lista e os números do painel. */
export function invalidateCollections(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
  ]);
}

// 409 (transição inválida, ordem finalizada, corrida) e 404 querem dizer que a tela está
// desatualizada: busca o detalhe de novo para mostrar o estado real.
function refetchIfStale(queryClient: QueryClient, id: string, error: unknown) {
  if (error instanceof ApiError && (error.statusCode === 409 || error.statusCode === 404)) {
    void invalidateOrder(queryClient, id);
  }
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateWorkOrderPayload) => apiPost<WorkOrder>('/work-orders', payload),
    // Ordem nova: não há detalhe nem histórico dela no cache, só lista e painel ficam velhos.
    onSuccess: () => invalidateCollections(queryClient),
  });
}

export function useUpdateWorkOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateWorkOrderPayload) =>
      apiPatch<WorkOrder>(`/work-orders/${id}`, payload),
    onSuccess: () => invalidateOrder(queryClient, id),
    onError: (error) => refetchIfStale(queryClient, id, error),
  });
}

export function useChangeStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: WorkOrderStatus) =>
      apiPatch<WorkOrder>(`/work-orders/${id}/status`, { status }),
    onSuccess: () => invalidateOrder(queryClient, id),
    onError: (error) => refetchIfStale(queryClient, id, error),
  });
}

export function useAssignWorkOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assigneeId: string | null) =>
      apiPatch<WorkOrder>(`/work-orders/${id}/assignee`, { assigneeId }),
    onSuccess: () => invalidateOrder(queryClient, id),
    onError: (error) => refetchIfStale(queryClient, id, error),
  });
}

export function useDeleteWorkOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiDelete(`/work-orders/${id}`),
    onSuccess: async () => {
      // A ordem não existe mais: tira detalhe e histórico do cache (buscar de novo daria 404).
      queryClient.removeQueries({ queryKey: workOrderKeys.detail(id) });
      queryClient.removeQueries({ queryKey: workOrderKeys.history(id) });
      await invalidateCollections(queryClient);
    },
    onError: (error) => refetchIfStale(queryClient, id, error),
  });
}
