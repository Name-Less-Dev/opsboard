import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/Button';
import { buttonClass } from '../components/button-styles';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Spinner } from '../components/Spinner';
import { DashboardSkeleton } from '../features/dashboard/DashboardSkeleton';
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
  const { data } = query;
  // Já há números na tela e outra busca está a caminho (botão, nova tentativa ou cache velho).
  const refreshing = data !== undefined && query.isFetching;

  // `dataUpdatedAt` no momento do clique em "Atualizar" (ou "Tentar de novo"). Quando muda, a
  // busca pedida terminou com sucesso e a região aria-live anuncia o novo horário.
  const [refreshedFrom, setRefreshedFrom] = useState<number | null>(null);
  const announcement =
    data && refreshedFrom !== null && !query.isFetching && query.dataUpdatedAt !== refreshedFrom
      ? `Painel atualizado às ${formatTime(data.generatedAt)}.`
      : '';

  function refresh() {
    // Ignora clique repetido durante a busca (o botão usa aria-disabled, ver abaixo).
    if (query.isFetching) return;
    setRefreshedFrom(query.dataUpdatedAt);
    void query.refetch();
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Painel</h1>
          {data && (
            <p className="text-sm text-muted">Atualizado às {formatTime(data.generatedAt)}</p>
          )}
        </div>
        {data && (
          <Button
            onClick={refresh}
            // aria-disabled em vez de disabled: um botão desabilitado perde o foco do teclado,
            // e a pessoa teria de procurá-lo de novo depois de cada atualização.
            aria-disabled={refreshing}
            className="aria-disabled:cursor-wait aria-disabled:opacity-60"
          >
            {refreshing && <Spinner />}
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </Button>
        )}
      </div>

      {query.isError && (
        // Com números anteriores, o erro aparece acima deles: o TanStack Query mantém o `data`
        // quando uma nova busca falha.
        <ErrorState error={query.error} onRetry={refresh} retrying={query.isFetching} />
      )}

      {/* Sempre no DOM: o leitor de tela só anuncia mudanças numa região que já existia. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>

      {data ? (
        <div aria-busy={refreshing} className="space-y-6">
          {summarizeStatus(data.byStatus).total === 0 ? (
            <EmptyState
              title="Nenhuma ordem cadastrada ainda."
              description="Os números do painel aparecem assim que a primeira ordem for criada."
              action={
                <Link to="/orders/new" className={buttonClass('primary', 'md')}>
                  Nova ordem
                </Link>
              }
            />
          ) : (
            <DashboardContent summary={data} />
          )}
        </div>
      ) : (
        query.isPending && <DashboardSkeleton />
      )}
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
        <dl className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <div>
            <dt className="text-sm text-muted">
              Total <span className="block text-xs">todas as ordens</span>
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatNumber(totals.total)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">
              Ativas <span className="block text-xs">abertas + em andamento</span>
            </dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatNumber(totals.active)}</dd>
          </div>
        </dl>
        <DistributionBar counts={summary.byStatus} summary={totals} />
      </section>

      <section aria-labelledby="painel-atrasadas" className="space-y-3">
        <h2 id="painel-atrasadas" className={sectionTitle}>
          Ordens atrasadas
        </h2>
        {overdue.count === 0 ? (
          <p className="flex items-center gap-2 rounded-card border border-tone-success-bg bg-tone-success-bg px-4 py-3 font-medium text-tone-success-fg">
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="currentColor">
              <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-1 11.4-3.7-3.7 1.4-1.4L9 10.6l4.3-4.3 1.4 1.4L9 13.4Z" />
            </svg>
            Nenhuma ordem atrasada. Tudo dentro do prazo.
          </p>
        ) : (
          <OverdueList orders={overdue.items} now={now} />
        )}
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
