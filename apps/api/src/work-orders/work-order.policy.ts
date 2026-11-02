import type { Role, WorkOrderStatus } from '../generated/prisma/enums';

// Todas as regras de permissão do fluxo ficam aqui, em funções puras: sem Prisma nem HTTP.
// Assim a matriz inteira é testável sem subir nada, e o service só traduz a decisão em status HTTP.

export type Actor = {
  id: string;
  role: Role;
};

export type OrderState = {
  status: WorkOrderStatus;
  assigneeId: string | null;
};

export type TransitionDecision =
  { allowed: true } | { allowed: false; reason: 'INVALID_TRANSITION' | 'FORBIDDEN' };

export type OrderActionDecision =
  { allowed: true } | { allowed: false; reason: 'ORDER_FINAL' | 'FORBIDDEN' };

export type CreateDecision = { allowed: true } | { allowed: false; reason: 'FORBIDDEN' };

export type EditableField = 'title' | 'description' | 'priority' | 'dueDate';

type TransitionRule = 'ASSIGNEE_OR_SUPERVISOR' | 'SUPERVISOR_ONLY';

// O grafo de estados: o que não está aqui é transição inválida.
const TRANSITIONS: Partial<
  Record<WorkOrderStatus, Partial<Record<WorkOrderStatus, TransitionRule>>>
> = {
  OPEN: { IN_PROGRESS: 'ASSIGNEE_OR_SUPERVISOR', CANCELLED: 'SUPERVISOR_ONLY' },
  IN_PROGRESS: { DONE: 'ASSIGNEE_OR_SUPERVISOR', CANCELLED: 'SUPERVISOR_ONLY' },
};

const OPERATOR_EDITABLE_FIELDS: ReadonlySet<EditableField> = new Set(['title', 'description']);

function isSupervisor(actor: Actor): boolean {
  return actor.role === 'SUPERVISOR';
}

function isAssignee(actor: Actor, order: OrderState): boolean {
  return order.assigneeId === actor.id;
}

function isFinal(status: WorkOrderStatus): boolean {
  return status === 'DONE' || status === 'CANCELLED';
}

export function canTransition(
  actor: Actor,
  order: OrderState,
  to: WorkOrderStatus,
): TransitionDecision {
  const rule = TRANSITIONS[order.status]?.[to];
  if (!rule) {
    return { allowed: false, reason: 'INVALID_TRANSITION' };
  }
  const permitted =
    isSupervisor(actor) || (rule === 'ASSIGNEE_OR_SUPERVISOR' && isAssignee(actor, order));
  return permitted ? { allowed: true } : { allowed: false, reason: 'FORBIDDEN' };
}

export function canEditFields(
  actor: Actor,
  order: OrderState,
  fields: readonly EditableField[],
): OrderActionDecision {
  if (isFinal(order.status)) {
    return { allowed: false, reason: 'ORDER_FINAL' };
  }
  if (isSupervisor(actor)) {
    return { allowed: true };
  }
  const permitted =
    isAssignee(actor, order) && fields.every((field) => OPERATOR_EDITABLE_FIELDS.has(field));
  return permitted ? { allowed: true } : { allowed: false, reason: 'FORBIDDEN' };
}

export function canAssign(actor: Actor, order: OrderState): OrderActionDecision {
  if (isFinal(order.status)) {
    return { allowed: false, reason: 'ORDER_FINAL' };
  }
  return isSupervisor(actor) ? { allowed: true } : { allowed: false, reason: 'FORBIDDEN' };
}

export function canCreate(actor: Actor, assigneeId: string | null | undefined): CreateDecision {
  const permitted = isSupervisor(actor) || assigneeId == null || assigneeId === actor.id;
  return permitted ? { allowed: true } : { allowed: false, reason: 'FORBIDDEN' };
}
