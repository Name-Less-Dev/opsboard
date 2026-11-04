import type { components } from '../../lib/api-types';
import { endOfLocalDayIso, type LocalDate } from '../../lib/dates';
import type { WorkOrderPriority } from './labels';

export type UpdateWorkOrderPayload = components['schemas']['UpdateWorkOrderDto'];

/** Valores do formulário de ordem: texto como digitado e prazo como data local. */
export type WorkOrderFormValues = {
  title: string;
  description: string;
  priority: WorkOrderPriority;
  dueDate: LocalDate;
};

/**
 * Monta o PATCH só com o que mudou; `null` quando nada mudou (a tela avisa e não chama a API).
 * Mandar só o alterado importa: a API verifica a permissão pelos campos ENVIADOS, então um
 * operador que mandasse a prioridade sem mudá-la receberia 403.
 */
export function buildUpdatePayload(
  original: WorkOrderFormValues,
  current: WorkOrderFormValues,
): UpdateWorkOrderPayload | null {
  const payload: UpdateWorkOrderPayload = {};

  // A API apara título e descrição; comparar já aparado evita PATCH por causa de um espaço.
  const title = current.title.trim();
  if (title !== original.title.trim()) payload.title = title;

  const description = current.description.trim();
  if (description !== original.description.trim()) {
    // Campo vazio limpa a descrição: a API aceita `null` para isso.
    payload.description = description === '' ? null : description;
  }

  if (current.priority !== original.priority) payload.priority = current.priority;

  // Prazo intocado não é enviado, então a hora original (que pode não ser fim do dia) fica.
  if (current.dueDate !== original.dueDate) payload.dueDate = endOfLocalDayIso(current.dueDate);

  return Object.keys(payload).length > 0 ? payload : null;
}
