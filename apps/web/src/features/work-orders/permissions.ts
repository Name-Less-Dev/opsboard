import type { AuthUser } from '../auth/auth-context';
import type { WorkOrder } from './labels';

// ESPELHO da política do back (apps/api/src/work-orders/work-order.policy.ts), que é a fonte
// da verdade: aqui só se decide o que MOSTRAR. Se a API recusar mesmo assim (regra mudou, outra
// aba alterou a ordem), a tela trata o erro pelo `code`. Mudou a regra lá, mude aqui e na
// matriz de testes.

export type AvailableActions = {
  /** Título e descrição. */
  editContent: boolean;
  /** Prioridade e prazo. */
  editPlanning: boolean;
  start: boolean;
  complete: boolean;
  cancel: boolean;
  assign: boolean;
  delete: boolean;
};

export function getAvailableActions(
  user: Pick<AuthUser, 'id' | 'role'>,
  order: Pick<WorkOrder, 'status' | 'assignee'>,
): AvailableActions {
  const supervisor = user.role === 'SUPERVISOR';
  const assignee = order.assignee?.id === user.id;
  const active = order.status === 'OPEN' || order.status === 'IN_PROGRESS';
  const assigneeOrSupervisor = supervisor || assignee;

  return {
    editContent: active && assigneeOrSupervisor,
    editPlanning: active && supervisor,
    start: order.status === 'OPEN' && assigneeOrSupervisor,
    complete: order.status === 'IN_PROGRESS' && assigneeOrSupervisor,
    cancel: active && supervisor,
    assign: active && supervisor,
    // Excluir não depende do estado: supervisor exclui inclusive ordem concluída ou cancelada.
    delete: supervisor,
  };
}
