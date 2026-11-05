import { formatCount, formatNumber } from '../../lib/format';
import { STATUSES } from '../work-orders/labels';
import { STATUS_FILLS, STATUS_PLURAL_LABELS } from './dashboard-labels';
import { StatusSwatch } from './StatusSwatch';
import type { StatusCounts, StatusSummary } from './summary';

/**
 * Barra horizontal com a parte de cada status no total, em HTML/CSS. Para leitor de tela é uma
 * imagem só (`role="img"`) com os números no `aria-label`; abaixo, a mesma informação em
 * tabela, visível para todos. Sem ordens, não há o que distribuir: não renderiza nada.
 */
export function DistributionBar({
  counts,
  summary,
}: {
  counts: StatusCounts;
  summary: StatusSummary;
}) {
  if (summary.total === 0) return null;

  const description = STATUSES.map(
    (status) =>
      `${STATUS_PLURAL_LABELS[status]} ${formatNumber(counts[status])} (${summary.percent[status]}%)`,
  ).join(', ');

  return (
    <div className="space-y-3">
      <div
        role="img"
        aria-label={`Distribuição das ${formatCount(summary.total, 'ordem', 'ordens')} por status: ${description}`}
        className="flex h-5 gap-0.5 overflow-hidden rounded-control bg-surface-muted"
      >
        {STATUSES.filter((status) => counts[status] > 0).map((status) => (
          <div
            key={status}
            // Largura exata (não o percentual arredondado): a barra sempre fecha em 100%.
            style={{ width: `${(counts[status] / summary.total) * 100}%` }}
            className={`min-w-1 ${STATUS_FILLS[status]}`}
          />
        ))}
      </div>

      <table className="w-full text-sm">
        <caption className="sr-only">Ordens por status</caption>
        <thead className="text-muted">
          <tr>
            <th scope="col" className="py-1 text-left font-medium">
              Status
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Ordens
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Percentual
            </th>
          </tr>
        </thead>
        <tbody>
          {STATUSES.map((status) => (
            <tr key={status} className="border-t border-border">
              <th scope="row" className="py-1.5 text-left font-normal">
                <span className="inline-flex items-center gap-2">
                  <StatusSwatch status={status} />
                  {STATUS_PLURAL_LABELS[status]}
                </span>
              </th>
              <td className="py-1.5 text-right tabular-nums">{formatNumber(counts[status])}</td>
              <td className="py-1.5 text-right tabular-nums">{summary.percent[status]}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
