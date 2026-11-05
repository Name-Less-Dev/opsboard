import type { WorkOrderStatus } from '../work-orders/labels';
import { STATUS_FILLS } from './dashboard-labels';

/** Amostra da cor e do padrão do status (a mesma da barra), decorativa. */
export function StatusSwatch({ status }: { status: WorkOrderStatus }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-3 shrink-0 rounded-sm ${STATUS_FILLS[status]}`}
    />
  );
}
