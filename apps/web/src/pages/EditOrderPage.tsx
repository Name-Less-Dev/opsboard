import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { buttonClass } from '../components/button-styles';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { useAuth } from '../features/auth/auth-context';
import { STATUS_LABELS, type WorkOrder } from '../features/work-orders/labels';
import { getAvailableActions } from '../features/work-orders/permissions';
import { buildUpdatePayload } from '../features/work-orders/update-payload';
import { useUpdateWorkOrder, useWorkOrder } from '../features/work-orders/use-work-order';
import { WorkOrderForm } from '../features/work-orders/WorkOrderForm';
import type { WorkOrderFormInput } from '../features/work-orders/work-order-schema';
import { ApiError } from '../lib/api';
import { isoToDateInput } from '../lib/dates';
import type { FlashState } from '../lib/use-flash';
import type { ListReturnState } from './OrderDetailPage';

const PLANNING_LOCKED_HINT = 'Somente supervisor altera prioridade e prazo.';

function toFormValues(order: WorkOrder): WorkOrderFormInput {
  return {
    title: order.title,
    description: order.description ?? '',
    priority: order.priority,
    dueDate: isoToDateInput(order.dueDate),
  };
}

export function EditOrderPage() {
  const { id = '' } = useParams();
  const query = useWorkOrder(id);

  // A primeira versão carregada é a base da edição. Se um 409 fizer o detalhe ser buscado de
  // novo, o formulário continua com o que foi digitado (e não vira "somente leitura" no meio).
  const [snapshot, setSnapshot] = useState<WorkOrder | null>(null);
  if (query.data && snapshot === null) setSnapshot(query.data);

  return (
    <main className="mx-auto max-w-2xl space-y-4">
      <Link
        to={`/orders/${id}`}
        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        ← Voltar para a ordem
      </Link>
      {snapshot ? (
        <EditOrder order={snapshot} />
      ) : query.isPending ? (
        <div role="status" className="space-y-4">
          <span className="sr-only">Carregando ordem…</span>
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : query.error instanceof ApiError &&
        (query.error.statusCode === 404 || query.error.statusCode === 400) ? (
        <EmptyState
          title="Ordem não encontrada."
          description="Ela pode ter sido excluída, ou o endereço está errado."
          action={
            <Link to="/orders" className={buttonClass('secondary', 'sm')}>
              Ir para a lista de ordens
            </Link>
          }
        />
      ) : (
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}
    </main>
  );
}

function EditOrder({ order }: { order: WorkOrder }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const update = useUpdateWorkOrder(order.id);
  const [noChanges, setNoChanges] = useState(false);

  if (!user) return null;
  const actions = getAvailableActions(user, order);
  const final = order.status === 'DONE' || order.status === 'CANCELLED';
  const detailHref = `/orders/${order.id}`;

  if (final || !actions.editContent) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Editar ordem</h1>
        <EmptyState
          title={
            final
              ? `Esta ordem está ${STATUS_LABELS[order.status].toLowerCase()} e não pode mais ser editada.`
              : 'Você não pode editar esta ordem.'
          }
          description={
            final ? undefined : 'Só o responsável pela ordem ou um supervisor pode editá-la.'
          }
          action={
            <Link to={detailHref} className={buttonClass('secondary', 'sm')}>
              Ver a ordem
            </Link>
          }
        />
      </>
    );
  }

  const original = toFormValues(order);

  return (
    <>
      <h1 className="text-2xl font-semibold break-words">Editar “{order.title}”</h1>
      <div className="rounded-card border border-border bg-surface p-4 sm:p-6">
        <WorkOrderForm
          defaultValues={original}
          planningLockedHint={actions.editPlanning ? undefined : PLANNING_LOCKED_HINT}
          dueDateHint="Vale até o fim do dia escolhido."
          submitLabel="Salvar alterações"
          pendingLabel="Salvando…"
          cancelHref={detailHref}
          notice={
            <div role="status">
              {noChanges && (
                <p className="rounded-card border border-border bg-surface-muted px-4 py-2 text-sm">
                  Nada mudou: não há alterações para salvar.
                </p>
              )}
            </div>
          }
          onSubmit={async (values) => {
            // Campos travados ficam com o valor original: nunca entram no PATCH.
            const current = actions.editPlanning
              ? values
              : { ...values, priority: original.priority, dueDate: original.dueDate };
            const payload = buildUpdatePayload(original, current);
            if (payload === null) {
              setNoChanges(true);
              return;
            }
            setNoChanges(false);
            await update.mutateAsync(payload);
            const state: FlashState & ListReturnState = {
              ...(location.state as ListReturnState | null),
              flash: 'Alterações salvas.',
            };
            await navigate(detailHref, { state });
          }}
        />
      </div>
    </>
  );
}
