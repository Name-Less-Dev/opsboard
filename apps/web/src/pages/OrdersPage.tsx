import { useEffect, useRef } from 'react';
import { Pagination } from '../components/Pagination';
import {
  clearFilters,
  withFilters,
  withPage,
  type ListFilters,
} from '../features/work-orders/list-params';
import { useListParams } from '../features/work-orders/use-list-params';
import { useWorkOrders } from '../features/work-orders/use-work-orders';
import { WorkOrderFilters } from '../features/work-orders/WorkOrderFilters';
import { WorkOrderList } from '../features/work-orders/WorkOrderList';
import { errorMessage } from '../lib/error-messages';

export function OrdersPage() {
  const [params, setParams] = useListParams();
  const query = useWorkOrders(params);
  const { data, isPlaceholderData } = query;
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Página além do fim (a API devolve lista vazia, mas diz quantas páginas existem): vai para
  // a última que existe, com `replace` para o "voltar" não cair de novo na página vazia.
  useEffect(() => {
    if (!data || isPlaceholderData) return;
    if (data.items.length === 0 && data.totalPages > 0 && params.page > data.totalPages) {
      setParams(withPage(params, data.totalPages), { replace: true });
    }
  }, [data, isPlaceholderData, params, setParams]);

  function changeFilters(changes: Partial<ListFilters>) {
    setParams(withFilters(params, changes));
  }

  function changePage(page: number) {
    setParams(withPage(params, page));
    // Leva a pessoa (e o leitor de tela) para o começo da lista da nova página.
    headingRef.current?.scrollIntoView({ block: 'start' });
    headingRef.current?.focus({ preventScroll: true });
  }

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Ordens de serviço</h1>

      <WorkOrderFilters
        params={params}
        onChange={changeFilters}
        onClear={() => setParams(clearFilters(params))}
      />

      <section aria-labelledby="results-title" className="space-y-4">
        {/* Alvo do foco ao trocar de página: fica logo acima da lista, não dos filtros. */}
        <h2
          id="results-title"
          ref={headingRef}
          tabIndex={-1}
          className="scroll-mt-4 text-lg font-semibold outline-none"
        >
          Resultados
        </h2>
        {query.isError && <p role="alert">{errorMessage(query.error)}</p>}
        {!data && query.isPending && <p>Carregando…</p>}
        {data && (
          <>
            <WorkOrderList orders={data.items} now={new Date(query.dataUpdatedAt)} />
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              onPageChange={changePage}
            />
          </>
        )}
      </section>
    </main>
  );
}
