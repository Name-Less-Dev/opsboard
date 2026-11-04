import { useId, useState } from 'react';
import { Button } from '../../components/Button';
import { Checkbox, CheckboxGroup, SelectField, TextField } from '../../components/form-fields';
import { PRIORITIES, PRIORITY_LABELS, STATUSES, STATUS_LABELS } from './labels';
import {
  hasActiveFilters,
  isDueRangeInvalid,
  SORT_FIELDS,
  type ListFilters,
  type ListParams,
  type SortField,
  type SortOrder,
} from './list-params';
import { SearchField } from './SearchField';

const STATUS_OPTIONS = STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] }));
const PRIORITY_OPTIONS = PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }));

const SORT_LABELS: Record<SortField, string> = {
  createdAt: 'Criação',
  updatedAt: 'Última atualização',
  dueDate: 'Prazo',
  priority: 'Prioridade',
};
const SORT_OPTIONS = SORT_FIELDS.map((value) => ({ value, label: SORT_LABELS[value] }));
const ORDER_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: 'desc', label: 'Decrescente' },
  { value: 'asc', label: 'Crescente' },
];

export function WorkOrderFilters({
  params,
  onChange,
  onClear,
}: {
  params: ListParams;
  onChange: (changes: Partial<ListFilters>) => void;
  onClear: () => void;
}) {
  const dueError = isDueRangeInvalid(params)
    ? '"Prazo até" não pode ser antes de "Prazo de".'
    : undefined;
  // No celular os filtros (menos a busca) ficam recolhidos, para a lista aparecer na primeira
  // tela. No desktop o painel fica sempre aberto e o botão nem aparece.
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const activeCount = [
    params.status.length > 0,
    params.priority.length > 0,
    params.mine,
    params.overdue,
    params.dueFrom !== null,
    params.dueTo !== null,
  ].filter(Boolean).length;
  // Com erro no prazo, o painel abre para o erro ficar visível.
  const open = expanded || dueError !== undefined;

  return (
    <section
      aria-label="Filtros"
      className="space-y-4 rounded-card border border-border bg-surface p-4"
    >
      <SearchField value={params.q} onSearch={(q) => onChange({ q })} />

      {/* No desktop a linha só existe se houver "Limpar filtros". */}
      <div
        className={`flex flex-wrap items-center gap-2 ${hasActiveFilters(params) ? '' : 'md:hidden'}`}
      >
        <Button
          size="sm"
          className="md:hidden"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setExpanded((value) => !value)}
        >
          {open ? 'Ocultar filtros' : 'Filtros'}
          {activeCount > 0 && ` (${activeCount})`}
        </Button>
        {hasActiveFilters(params) && (
          <Button size="sm" onClick={onClear}>
            Limpar filtros
          </Button>
        )}
      </div>

      <div id={panelId} className={`space-y-4 ${open ? 'block' : 'hidden'} md:block`}>
        <div className="grid gap-4 md:grid-cols-2">
          <CheckboxGroup
            legend="Status"
            options={STATUS_OPTIONS}
            selected={params.status}
            onChange={(status) => onChange({ status })}
          />
          <CheckboxGroup
            legend="Prioridade"
            options={PRIORITY_OPTIONS}
            selected={params.priority}
            onChange={(priority) => onChange({ priority })}
          />
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox
            label="Minhas ordens"
            checked={params.mine}
            onChange={(event) => onChange({ mine: event.target.checked })}
          />
          <Checkbox
            label="Somente atrasadas"
            checked={params.overdue}
            onChange={(event) => onChange({ overdue: event.target.checked })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Prazo de"
            type="date"
            value={params.dueFrom ?? ''}
            onChange={(event) => onChange({ dueFrom: event.target.value || null })}
          />
          <TextField
            label="Prazo até"
            type="date"
            value={params.dueTo ?? ''}
            error={dueError}
            onChange={(event) => onChange({ dueTo: event.target.value || null })}
          />
          <SelectField
            label="Ordenar por"
            options={SORT_OPTIONS}
            value={params.sortBy}
            onChange={(event) => onChange({ sortBy: event.target.value as SortField })}
          />
          <SelectField
            label="Sentido"
            options={ORDER_OPTIONS}
            value={params.order}
            onChange={(event) => onChange({ order: event.target.value as SortOrder })}
          />
        </div>
      </div>
    </section>
  );
}
