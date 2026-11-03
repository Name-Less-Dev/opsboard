import type { Prisma } from '../generated/prisma/client';

// Lista de permissão do formato único de resposta: do usuário só saem id e nome.
// Compartilhado pela lista, pelo detalhe e pelo painel, para o formato ser sempre o mesmo.
export const WORK_ORDER_SELECT = {
  id: true,
  title: true,
  description: true,
  priority: true,
  status: true,
  dueDate: true,
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkOrderSelect;

export type WorkOrderResponse = Prisma.WorkOrderGetPayload<{ select: typeof WORK_ORDER_SELECT }>;
