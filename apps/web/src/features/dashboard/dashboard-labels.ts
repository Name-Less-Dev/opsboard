import type { WorkOrderStatus } from '../work-orders/labels';

/** Rótulos no plural, para contadores ("Abertas: 5 ordens"). */
export const STATUS_PLURAL_LABELS: Record<WorkOrderStatus, string> = {
  OPEN: 'Abertas',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluídas',
  CANCELLED: 'Canceladas',
};

/** Cor e padrão de cada status na barra e na legenda (nunca só a cor). */
export const STATUS_FILLS: Record<WorkOrderStatus, string> = {
  OPEN: 'bg-tone-info-fg',
  IN_PROGRESS: 'bg-tone-warning-fg fill-pattern-stripes',
  DONE: 'bg-tone-success-fg fill-pattern-backstripes',
  CANCELLED: 'bg-tone-neutral-fg fill-pattern-dots',
};

/** Base comum dos cards do painel (status e atrasadas). */
export const DASHBOARD_CARD_CLASS =
  'group flex h-full flex-col rounded-card border p-4 transition-colors';
