import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { OverdueBadge, PriorityBadge, StatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { buttonClass } from '../components/button-styles';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { FlashMessage } from '../components/FlashMessage';
import { Skeleton } from '../components/Skeleton';
import { useAuth } from '../features/auth/auth-context';
import { AssignForm } from '../features/work-orders/AssignForm';
import {
  STATUS_LABELS,
  type WorkOrder,
  type WorkOrderStatus,
} from '../features/work-orders/labels';
import { isOverdue } from '../features/work-orders/overdue';
import { getAvailableActions } from '../features/work-orders/permissions';
import {
  useChangeStatus,
  useDeleteWorkOrder,
  useWorkOrder,
} from '../features/work-orders/use-work-order';
import { ApiError } from '../lib/api';
import { errorMessage } from '../lib/error-messages';
import { formatDateTime } from '../lib/format';
import { useFlash, type FlashState } from '../lib/use-flash';

/** Busca da lista guardada ao abrir o detalhe, para "voltar" com os mesmos filtros. */
export type ListReturnState = { listSearch?: string };

const STATUS_SUCCESS: Partial<Record<WorkOrderStatus, string>> = {
  IN_PROGRESS: 'Ordem iniciada.',
  DONE: 'Ordem concluída.',
  CANCELLED: 'Ordem cancelada.',
};

function isNotFound(error: unknown): boolean {
  // 400 aqui só pode ser o `:id` que não é UUID: para quem usa, é a mesma coisa que 404.
  return error instanceof ApiError && (error.statusCode === 404 || error.statusCode === 400);
}

function BackToList() {
  const location = useLocation();
  const listSearch = (location.state as ListReturnState | null)?.listSearch ?? '';
  return (
    <Link
      to={`/orders${listSearch}`}
      className="text-sm font-medium text-primary underline-offset-2 hover:underline"
    >
      ← Voltar para a lista
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Carregando ordem…</span>
      <Skeleton className="h-8 w-2/3" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const query = useWorkOrder(id);

  return (
    <main className="mx-auto max-w-3xl space-y-4">
      <BackToList />
      {query.data ? (
        <OrderDetail order={query.data} fetchedAt={query.dataUpdatedAt} />
      ) : query.isPending ? (
        <DetailSkeleton />
      ) : isNotFound(query.error) ? (
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

function OrderDetail({ order, fetchedAt }: { order: WorkOrder; fetchedAt: number }) {
  const { user } = useAuth();
  const location = useLocation();
  const flash = useFlash();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const navigate = useNavigate();
  const changeStatus = useChangeStatus(order.id);
  const remove = useDeleteWorkOrder(order.id);
  const [actionError, setActionError] = useState<unknown>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Depois de uma ação, o botão clicado costuma sumir (Iniciar vira Concluir; Cancelar some) e o
  // foco cairia no <body>; ele vai para o título, e o aviso sai na região role="status". É um
  // efeito, e não um `focus()` direto, porque os efeitos dos filhos rodam antes: quando este
  // roda, o <dialog> já fechou (com ele aberto, o resto da página fica inerte e não recebe foco).
  const [focusRequest, setFocusRequest] = useState(0);
  const focusHeading = () => setFocusRequest((value) => value + 1);
  useEffect(() => {
    if (focusRequest > 0) headingRef.current?.focus();
  }, [focusRequest]);

  if (!user) return null;
  const actions = getAvailableActions(user, order);
  const final = order.status === 'DONE' || order.status === 'CANCELLED';
  const busy = changeStatus.isPending || remove.isPending;
  const pendingStatus = changeStatus.isPending ? changeStatus.variables : undefined;

  function runStatus(status: WorkOrderStatus) {
    setActionError(null);
    flash.dismiss();
    changeStatus.mutate(status, {
      onSuccess: () => {
        flash.setMessage(STATUS_SUCCESS[status] ?? 'Status atualizado.');
        focusHeading();
      },
      // Em 409 o hook já busca o detalhe de novo; aqui só a mensagem, pelo `code`.
      onError: (error) => setActionError(error),
      onSettled: () => setConfirmCancel(false),
    });
  }

  function runDelete() {
    setActionError(null);
    remove.mutate(undefined, {
      onSuccess: () => {
        const listSearch = (location.state as ListReturnState | null)?.listSearch ?? '';
        const state: FlashState = { flash: 'Ordem excluída.' };
        void navigate(`/orders${listSearch}`, { state });
      },
      onError: (error) => {
        setConfirmDelete(false);
        setActionError(error);
      },
    });
  }

  const hasActions =
    actions.editContent || actions.start || actions.complete || actions.cancel || actions.delete;

  return (
    <article className="space-y-5">
      <FlashMessage message={flash.message} onDismiss={flash.dismiss} />

      <header className="space-y-2">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold break-words outline-none"
        >
          {order.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={order.status} />
          <PriorityBadge priority={order.priority} />
          {isOverdue(order, new Date(fetchedAt)) && <OverdueBadge />}
        </div>
      </header>

      {final && (
        <p className="rounded-card border border-border bg-surface-muted px-4 py-3 text-sm">
          Esta ordem está {STATUS_LABELS[order.status].toLowerCase()} e é somente leitura: não pode
          mais ser editada, mudar de status nem trocar de responsável.
          {actions.delete && ' Um supervisor ainda pode excluí-la.'}
        </p>
      )}

      {actionError !== null && (
        <div
          role="alert"
          className="rounded-card border border-danger-border bg-danger-bg px-4 py-3 text-sm font-medium text-danger"
        >
          {errorMessage(actionError)}
        </div>
      )}

      {hasActions && (
        <div role="group" aria-label="Ações da ordem" className="flex flex-wrap gap-2">
          {actions.editContent && (
            <Link
              to={`/orders/${order.id}/edit`}
              state={location.state as ListReturnState | null}
              className={buttonClass('secondary', 'sm')}
            >
              Editar ordem
            </Link>
          )}
          {actions.start && (
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => runStatus('IN_PROGRESS')}
            >
              {pendingStatus === 'IN_PROGRESS' ? 'Iniciando…' : 'Iniciar ordem'}
            </Button>
          )}
          {actions.complete && (
            <Button size="sm" variant="primary" disabled={busy} onClick={() => runStatus('DONE')}>
              {pendingStatus === 'DONE' ? 'Concluindo…' : 'Concluir ordem'}
            </Button>
          )}
          {actions.cancel && (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
            >
              Cancelar ordem
            </Button>
          )}
          {actions.delete && (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Excluir ordem
            </Button>
          )}
        </div>
      )}

      <dl className="grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 sm:p-6">
        <div className="sm:col-span-2">
          <Field label="Descrição">
            {order.description ? (
              <span className="whitespace-pre-line">{order.description}</span>
            ) : (
              <span className="text-muted">Sem descrição</span>
            )}
          </Field>
        </div>
        <Field label="Responsável">
          {order.assignee?.name ?? <span className="text-muted">Sem responsável</span>}
        </Field>
        <Field label="Criada por">{order.createdBy.name}</Field>
        <Field label="Prazo">
          <time dateTime={order.dueDate}>{formatDateTime(order.dueDate)}</time>
        </Field>
        <Field label="Criada em">
          <time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time>
        </Field>
        <Field label="Atualizada em">
          <time dateTime={order.updatedAt}>{formatDateTime(order.updatedAt)}</time>
        </Field>
      </dl>

      {actions.assign && (
        <AssignForm
          // Novo responsável vindo da API: o seletor recomeça do valor atual.
          key={order.assignee?.id ?? 'none'}
          order={order}
          disabled={busy}
          onSuccess={() => {
            setActionError(null);
            flash.setMessage('Responsável atualizado.');
            focusHeading();
          }}
          onError={setActionError}
        />
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancelar esta ordem?"
        confirmLabel="Cancelar ordem"
        pendingLabel="Cancelando…"
        pending={changeStatus.isPending}
        onConfirm={() => runStatus('CANCELLED')}
        onClose={() => setConfirmCancel(false)}
        returnFocusFallback={headingRef}
      >
        <p>
          A ordem “{order.title}” passa para Cancelada e não poderá mais ser editada, mudar de
          status nem trocar de responsável.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDelete}
        title="Excluir esta ordem?"
        confirmLabel="Excluir ordem"
        pendingLabel="Excluindo…"
        pending={remove.isPending}
        onConfirm={runDelete}
        onClose={() => setConfirmDelete(false)}
        returnFocusFallback={headingRef}
      >
        <p>A ordem “{order.title}” será excluída de vez, junto com todo o histórico dela.</p>
        <p>Não dá para desfazer.</p>
      </ConfirmDialog>
    </article>
  );
}
