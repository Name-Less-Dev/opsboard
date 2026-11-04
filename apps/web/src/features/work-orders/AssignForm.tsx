import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { SelectField } from '../../components/form-fields';
import { ROLE_LABELS } from '../auth/role-labels';
import type { WorkOrder } from './labels';
import { useAssignWorkOrder } from './use-work-order';
import { useUsers } from './use-users';

const NONE = '';

/** Atribuição (só supervisor): escolhe o usuário e confirma; "Sem responsável" remove. */
export function AssignForm({
  order,
  disabled,
  onSuccess,
  onError,
}: {
  order: WorkOrder;
  disabled: boolean;
  onSuccess: () => void;
  onError: (error: unknown) => void;
}) {
  const users = useUsers();
  const assign = useAssignWorkOrder(order.id);
  const current = order.assignee?.id ?? NONE;
  const [selected, setSelected] = useState(current);

  // O responsável atual entra na lista mesmo antes de os usuários carregarem.
  const options = [
    { value: NONE, label: 'Sem responsável' },
    ...(users.data ?? (order.assignee ? [{ ...order.assignee, role: undefined }] : [])).map(
      (user) => ({
        value: user.id,
        label: user.role ? `${user.name} (${ROLE_LABELS[user.role]})` : user.name,
      }),
    ),
  ];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    assign.mutate(selected === NONE ? null : selected, { onSuccess, onError });
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Atribuir responsável"
      className="space-y-3 rounded-card border border-border bg-surface p-4 sm:p-6"
    >
      <h2 className="font-semibold">Atribuir responsável</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-80">
          <SelectField
            label="Novo responsável"
            options={options}
            value={selected}
            disabled={users.isPending || assign.isPending}
            hint={
              users.isError
                ? 'Não foi possível carregar os usuários. Tente recarregar a página.'
                : undefined
            }
            onChange={(event) => setSelected(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={disabled || assign.isPending || selected === current}>
          {assign.isPending ? 'Atribuindo…' : 'Atribuir responsável'}
        </Button>
      </div>
    </form>
  );
}
