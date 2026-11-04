import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';
import type { components } from '../../lib/api-types';
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
// páginas e filtros) e o detalhe ficam velhos e são buscados de novo quando aparecerem.
function invalidateOrder(queryClient: QueryClient, id: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: workOrderKeys.detail(id) }),
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
    onSuccess: (created) => invalidateOrder(queryClient, created.id),
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
      // A ordem não existe mais: tira o detalhe do cache (buscar de novo daria 404).
      queryClient.removeQueries({ queryKey: workOrderKeys.detail(id) });
      await queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() });
    },
    onError: (error) => refetchIfStale(queryClient, id, error),
  });
}
