import { Link } from 'react-router';
import { ErrorState } from '../components/ErrorState';
import {
  myOpenOrdersHref,
  overdueListHref,
  statusListHref,
} from '../features/dashboard/dashboard-links';
import { DistributionBar } from '../features/dashboard/DistributionBar';
import { OverdueCard } from '../features/dashboard/OverdueCard';
import { OverdueList } from '../features/dashboard/OverdueList';
import { StatusCard } from '../features/dashboard/StatusCard';
import { summarizeStatus, type DashboardSummary } from '../features/dashboard/summary';
import { useDashboardSummary } from '../features/dashboard/use-dashboard-summary';
import { STATUSES } from '../features/work-orders/labels';
import { formatNumber, formatTime } from '../lib/format';

export function DashboardPage() {
  const query = useDashboardSummary();

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Painel</h1>
      {query.data ? (
        <DashboardContent summary={query.data} />
      ) : query.isError ? (
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : null}
    </main>
  );
}

const sectionTitle = 'text-lg font-semibold';

function DashboardContent({ summary }: { summary: DashboardSummary }) {
  const totals = summarizeStatus(summary.byStatus);
  // "Agora" do painel é o instante em que o servidor contou as atrasadas, não o relógio do
  // navegador: assim "há N dias" nunca contradiz a contagem (e não muda sozinho na tela).
  const now = new Date(summary.generatedAt);
  const { overdue } = summary;

  return (
    <>
      <p className="text-sm text-muted">Atualizado às {formatTime(summary.generatedAt)}</p>

      <section aria-labelledby="painel-status" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="painel-status" className={sectionTitle}>
            Ordens por status
          </h2>
          <Link
            to={myOpenOrdersHref()}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Minhas ordens em aberto
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <li className="col-span-2 lg:col-span-1">
            <OverdueCard count={overdue.count} href={overdueListHref()} />
          </li>
          {STATUSES.map((status) => (
            <li key={status}>
              <StatusCard
                status={status}
                count={summary.byStatus[status]}
                href={statusListHref(status)}
              />
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="painel-resumo"
        className="space-y-4 rounded-card border border-border bg-surface p-4"
      >
        <h2 id="painel-resumo" className={sectionTitle}>
          Resumo
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div>
            <dt className="text-sm text-muted">Total de ordens</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatNumber(totals.total)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Ativas (abertas + em andamento)</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatNumber(totals.active)}</dd>
          </div>
        </dl>
        <DistributionBar counts={summary.byStatus} summary={totals} />
      </section>

      <section aria-labelledby="painel-atrasadas" className="space-y-3">
        <h2 id="painel-atrasadas" className={sectionTitle}>
          Ordens atrasadas
        </h2>
        <OverdueList orders={overdue.items} now={now} />
        {overdue.count > overdue.items.length && (
          <Link
            to={overdueListHref()}
            className="inline-block text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Ver todas as {formatNumber(overdue.count)} atrasadas
          </Link>
        )}
      </section>
    </>
  );
}
