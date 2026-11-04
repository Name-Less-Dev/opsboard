import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../features/auth/auth-context';
import { ROLE_LABELS } from '../features/auth/role-labels';
import { useCreateWorkOrder } from '../features/work-orders/use-work-order';
import { useUsers } from '../features/work-orders/use-users';
import { WorkOrderForm, type AssigneeField } from '../features/work-orders/WorkOrderForm';
import {
  createWorkOrderSchema,
  type WorkOrderFormInput,
} from '../features/work-orders/work-order-schema';
import { endOfLocalDayIso, todayDateInput } from '../lib/dates';
import type { FlashState } from '../lib/use-flash';

const DEFAULT_VALUES: WorkOrderFormInput = {
  title: '',
  description: '',
  priority: 'MEDIUM',
  dueDate: '',
  assigneeId: '',
};

export function NewOrderPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const create = useCreateWorkOrder();
  const users = useUsers();
  // "Hoje" fixado ao abrir a tela: o limite do prazo não muda no meio do preenchimento.
  const [today] = useState(() => todayDateInput());
  const schema = useMemo(() => createWorkOrderSchema(today), [today]);

  if (!user) return null;
  const supervisor = user.role === 'SUPERVISOR';

  const assignee: AssigneeField = supervisor
    ? {
        kind: 'select',
        options: [
          { value: '', label: 'Sem responsável' },
          ...(users.data ?? []).map((item) => ({
            value: item.id,
            label: `${item.name} (${ROLE_LABELS[item.role]})`,
          })),
        ],
        disabled: users.isPending,
        hint: users.isPending
          ? 'Carregando usuários…'
          : users.isError
            ? 'Não foi possível carregar os usuários. A ordem pode ser criada sem responsável e atribuída depois.'
            : undefined,
      }
    : { kind: 'fixed', name: user.name };

  return (
    <main className="mx-auto max-w-2xl space-y-4">
      <Link
        to="/orders"
        className="text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        ← Voltar para a lista
      </Link>
      <h1 className="text-2xl font-semibold">Nova ordem de serviço</h1>
      <div className="rounded-card border border-border bg-surface p-4 sm:p-6">
        <WorkOrderForm
          schema={schema}
          defaultValues={DEFAULT_VALUES}
          minDueDate={today}
          dueDateHint="Vale até o fim do dia escolhido. Não pode ser anterior a hoje."
          assignee={assignee}
          submitLabel="Criar ordem"
          pendingLabel="Criando…"
          cancelHref="/orders"
          onSubmit={async (values) => {
            const created = await create.mutateAsync({
              title: values.title,
              ...(values.description ? { description: values.description } : {}),
              priority: values.priority,
              dueDate: endOfLocalDayIso(values.dueDate),
              // Operador não envia: a API faz dele o responsável.
              ...(supervisor ? { assigneeId: values.assigneeId || null } : {}),
            });
            const state: FlashState = { flash: 'Ordem criada.' };
            await navigate(`/orders/${created.id}`, { state });
          }}
        />
      </div>
    </main>
  );
}
