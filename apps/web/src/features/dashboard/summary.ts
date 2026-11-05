import type { components } from '../../lib/api-types';
import { STATUSES, type WorkOrderStatus } from '../work-orders/labels';

export type DashboardSummary = components['schemas']['DashboardSummaryDto'];
export type StatusCounts = components['schemas']['StatusCountsDto'];

export type StatusSummary = {
  total: number;
  /** Abertas + em andamento. */
  active: number;
  /** Percentual inteiro de cada status; soma exatamente 100 (ou 0 se não há ordens). */
  percent: Record<WorkOrderStatus, number>;
};

export function summarizeStatus(byStatus: StatusCounts): StatusSummary {
  const total = STATUSES.reduce((sum, status) => sum + byStatus[status], 0);
  const active = byStatus.OPEN + byStatus.IN_PROGRESS;
  const percent = { OPEN: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 };
  if (total === 0) return { total, active, percent };

  // Maior resto: arredonda todos para baixo e dá o ponto que falta para 100 a quem perdeu
  // mais no arredondamento (empate: ordem do enum). Arredondar cada um sozinho poderia somar
  // 99 ou 101.
  const exact = STATUSES.map((status) => ({ status, value: (byStatus[status] * 100) / total }));
  for (const { status, value } of exact) percent[status] = Math.floor(value);
  const missing = 100 - STATUSES.reduce((sum, status) => sum + percent[status], 0);
  [...exact]
    .sort((a, b) => b.value - Math.floor(b.value) - (a.value - Math.floor(a.value)))
    .slice(0, missing)
    .forEach(({ status }) => (percent[status] += 1));

  return { total, active, percent };
}
