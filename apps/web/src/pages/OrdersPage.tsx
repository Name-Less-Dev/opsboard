import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../components/Button';
import { buttonClass } from '../components/button-styles';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Pagination } from '../components/Pagination';
import { FlashMessage } from '../components/FlashMessage';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../features/auth/auth-context';
import { ExportCsvButton } from '../features/work-orders/csv/ExportCsvButton';
import type { WorkOrderPage } from '../features/work-orders/labels';
import {
  clearFilters,
  hasActiveFilters,
  isDueRangeInvalid,
  withFilters,
  withPage,
  type ListFilters,
  type ListParams,
} from '../features/work-orders/list-params';
import { useListParams } from '../features/work-orders/use-list-params';
import { useWorkOrders } from '../features/work-orders/use-work-orders';
import { WorkOrderFilters } from '../features/work-orders/WorkOrderFilters';
import { WorkOrderList } from '../features/work-orders/WorkOrderList';
import { WorkOrderListSkeleton } from '../features/work-orders/WorkOrderListSkeleton';
import { formatCount } from '../lib/format';
import { useFlash } from '../lib/use-flash';

/** Última resposta que deu certo, com os filtros e o instante em que foi buscada. */
type Shown = { page: WorkOrderPage; params: ListParams; fetchedAt: number };

export function OrdersPage() {
  const [params, setParams] = useListParams();
  const query = useWorkOrders(params);
  const { data, isPlaceholderData } = query;
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Aviso vindo de outra tela (ex.: "Ordem excluída.").
  const flash = useFlash();
  const { user } = useAuth();

  // O `data` do TanStack Query some quando a requisição falha. Guardar a última resposta boa
  // permite manter a lista na tela durante o erro, em vez de apagá-la. Atualizar o estado
  // durante a renderização (e não num efeito) evita um quadro com o valor antigo.
  const [shown, setShown] = useState<Shown | null>(null);
  if (data && !isPlaceholderData && data !== shown?.page) {
    setShown({ page: data, params, fetchedAt: query.dataUpdatedAt });
  }

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

  const clear = () => setParams(clearFilters(params));
  // Já há algo na tela e outra requisição está a caminho (filtro, página ou nova tentativa).
  const updating = shown !== null && query.isFetching;
  const firstLoad = shown === null && query.isPending && !isDueRangeInvalid(params);

  return (
    <main className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Ordens de serviço</h1>
        <div className="flex flex-wrap gap-2">
          {/* Só o supervisor importa (a API responde 403 para o operador). */}
          {user?.role === 'SUPERVISOR' && (
            <Link to="/orders/import" className={buttonClass('secondary', 'md')}>
              Importar CSV
            </Link>
          )}
          <Link to="/orders/new" className={buttonClass('primary', 'md')}>
            Nova ordem
          </Link>
        </div>
      </div>

      <FlashMessage message={flash.message} onDismiss={flash.dismiss} />

      <WorkOrderFilters params={params} onChange={changeFilters} onClear={clear} />

      <section
        aria-labelledby="results-title"
        aria-busy={updating || firstLoad}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-h-7 items-center gap-4">
            {/* Alvo do foco ao trocar de página: fica logo acima da lista, não dos filtros. */}
            <h2
              id="results-title"
              ref={headingRef}
              tabIndex={-1}
              className="scroll-mt-4 text-lg font-semibold outline-none"
            >
              Resultados
            </h2>
            {updating && (
              <span className="inline-flex items-center gap-2 text-sm text-muted">
                <Spinner />
                Atualizando…
              </span>
            )}
          </div>
          {/* Exporta pelos filtros da URL, não pelo que está na tela: o total só é mostrado
              quando a lista na tela corresponde a eles. */}
          <ExportCsvButton
            params={params}
            total={shown && !updating ? shown.page.total : null}
            disabled={isDueRangeInvalid(params)}
          />
        </div>

        {/* Sempre no DOM: a região precisa existir antes de o texto mudar para ser anunciada.
            Fica vazia enquanto atualiza, então cada resultado novo é anunciado. */}
        <p aria-live="polite" className="sr-only">
          {shown && !updating
            ? formatCount(shown.page.total, 'ordem encontrada', 'ordens encontradas')
            : ''}
        </p>

        {query.isError && (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        )}

        {firstLoad && <WorkOrderListSkeleton />}

        {shown && shown.page.total === 0 && !query.isError && (
          // Os filtros decidem a mensagem: sem filtro, não há ordem nenhuma. Num erro o vazio
          // anterior some (não há dado a preservar, e o texto poderia não valer mais).
          // Sem botão de "Nova ordem": a criação ainda não existe (Dia 7).
          <EmptyState
            {...(hasActiveFilters(shown.params)
              ? {
                  title: 'Nenhuma ordem encontrada com esses filtros.',
                  description: 'Tente mudar a busca ou limpar os filtros.',
                  action: (
                    <Button size="sm" onClick={clear}>
                      Limpar filtros
                    </Button>
                  ),
                }
              : {
                  title: 'Nenhuma ordem de serviço cadastrada ainda.',
                  description: 'Quando houver ordens, elas aparecem aqui.',
                })}
          />
        )}

        {shown && shown.page.total > 0 && (
          // Atualizando: os dados anteriores ficam, só mais apagados, sem trocar por skeleton.
          <div
            className={`space-y-4 transition-opacity ${updating ? 'opacity-60' : 'opacity-100'}`}
          >
            <WorkOrderList orders={shown.page.items} now={new Date(shown.fetchedAt)} />
            <Pagination
              page={shown.page.page}
              totalPages={shown.page.totalPages}
              total={shown.page.total}
              onPageChange={changePage}
              disabled={updating}
            />
          </div>
        )}
      </section>
    </main>
  );
}
