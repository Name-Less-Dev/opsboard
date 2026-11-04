import type { components } from '../../lib/api-types';

export type WorkOrder = components['schemas']['WorkOrderResponseDto'];
export type WorkOrderPage = components['schemas']['WorkOrderPageResponseDto'];
export type WorkOrderStatus = components['schemas']['WorkOrderStatus'];
export type WorkOrderPriority = components['schemas']['WorkOrderPriority'];

// `Record<Union, string>` obriga a ter um rótulo para cada valor do enum gerado: se a API
// ganhar um status novo, isto deixa de compilar.
export const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELLED: 'Cancelada',
};

export const PRIORITY_LABELS: Record<WorkOrderPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

// Ordem do fluxo e de gravidade; também é a ordem canônica das listas na URL.
export const STATUSES = Object.keys(STATUS_LABELS) as WorkOrderStatus[];
export const PRIORITIES = Object.keys(PRIORITY_LABELS) as WorkOrderPriority[];
