import { Link } from 'react-router';
import { formatCount, formatNumber } from '../../lib/format';
import type { WorkOrderStatus } from '../work-orders/labels';
import { DASHBOARD_CARD_CLASS, STATUS_PLURAL_LABELS } from './dashboard-labels';
import { StatusSwatch } from './StatusSwatch';

export function StatusCard({
  status,
  count,
  href,
}: {
  status: WorkOrderStatus;
  count: number;
  href: string;
}) {
  const label = STATUS_PLURAL_LABELS[status];
  return (
    <Link
      to={href}
      // O nome acessível junta o que o card mostra em pedaços: "Abertas: 5 ordens, ver lista".
      aria-label={`${label}: ${formatCount(count, 'ordem', 'ordens')}, ver lista`}
      className={`${DASHBOARD_CARD_CLASS} border-border bg-surface hover:border-control-border`}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-muted">
        <StatusSwatch status={status} />
        {label}
      </span>
      <span className="mt-2 text-3xl font-semibold tabular-nums">{formatNumber(count)}</span>
      <span className="mt-auto pt-2 text-sm font-medium text-primary group-hover:underline">
        Ver lista
      </span>
    </Link>
  );
}
