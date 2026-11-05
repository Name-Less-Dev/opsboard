import type { WorkOrderPriority, WorkOrderStatus } from '../../generated/prisma/enums';

// Mesmos rótulos da interface (tabela do CLAUDE.md). O CSV é lido por gente, no Excel.
export const PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELLED: 'Cancelada',
};
