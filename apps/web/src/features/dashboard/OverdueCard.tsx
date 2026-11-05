import { Link } from 'react-router';
import { formatCount, formatNumber } from '../../lib/format';
import { DASHBOARD_CARD_CLASS } from './dashboard-labels';

/** Destacado dos demais por borda, ícone e texto, não só pela cor. */
export function OverdueCard({
  count,
  href,
  className = '',
}: {
  count: number;
  href: string;
  className?: string;
}) {
  return (
    <Link
      to={href}
      aria-label={`Atrasadas: ${formatCount(count, 'ordem', 'ordens')}, ver lista`}
      className={`${DASHBOARD_CARD_CLASS} border-2 border-danger bg-danger-bg ${className}`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-danger">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="currentColor">
          <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 4v4.6l3 1.8-1 1.7-4-2.4V6h2Z" />
        </svg>
        Atrasadas
      </span>
      <span className="mt-2 text-3xl font-semibold text-danger tabular-nums">
        {formatNumber(count)}
      </span>
      <span className="text-xs text-muted">Prazo vencido e ainda ativas</span>
      <span className="mt-auto pt-2 text-sm font-medium text-primary group-hover:underline">
        Ver lista
      </span>
    </Link>
  );
}
