import { useRef, useState } from 'react';
import { ErrorState } from '../../../components/ErrorState';
import { Pagination } from '../../../components/Pagination';
import { Skeleton } from '../../../components/Skeleton';
import { HistoryTimeline } from './HistoryTimeline';
import { useWorkOrderHistory } from './use-work-order-history';

function HistorySkeleton() {
  return (
    <div role="status" className="space-y-5">
      <span className="sr-only">Carregando histórico…</span>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Busca e estados do histórico. Tudo fica dentro da seção: um erro aqui não derruba o resto do
 * detalhe. A página é estado local (não vai para a URL) e volta à 1 ao abrir outra ordem.
 */
export function HistorySection({ orderId }: { orderId: string }) {
  const [page, setPage] = useState(1);
  const query = useWorkOrderHistory(orderId, page);
  const { data } = query;
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Outra página (ou nova busca após uma ação) a caminho, com a anterior ainda na tela.
  const updating = data !== undefined && query.isFetching;

  function changePage(next: number) {
    setPage(next);
    // Leva a pessoa (e o leitor de tela) para o começo da linha do tempo.
    headingRef.current?.focus();
  }

  return (
    <section
      aria-labelledby="historico-titulo"
      className="space-y-4 rounded-card border border-border bg-surface p-4 sm:p-6"
    >
      <h2
        id="historico-titulo"
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-semibold outline-none"
      >
        Histórico
      </h2>

      {query.isError && (
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}

      {data ? (
        data.total === 0 ? (
          <p className="text-sm text-muted">Sem eventos registrados.</p>
        ) : (
          <div aria-busy={updating} className="space-y-4">
            <HistoryTimeline events={data.items} />
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              onPageChange={changePage}
              disabled={query.isPlaceholderData}
              label="Paginação do histórico"
              itemNames={['evento', 'eventos']}
            />
          </div>
        )
      ) : (
        query.isPending && <HistorySkeleton />
      )}
    </section>
  );
}
