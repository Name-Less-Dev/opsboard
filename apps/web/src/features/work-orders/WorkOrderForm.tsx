import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { ErrorSummary, type SummaryError } from '../../components/ErrorSummary';
import { SelectField, TextAreaField, TextField } from '../../components/form-fields';
import { ApiError } from '../../lib/api';
import { ERROR_MESSAGES, errorMessage, FIELD_ERROR_MESSAGES } from '../../lib/error-messages';
import { PRIORITIES, PRIORITY_LABELS } from './labels';
import {
  DESCRIPTION_MAX,
  editWorkOrderSchema,
  TITLE_MAX,
  type WorkOrderFormInput,
  type WorkOrderFormOutput,
} from './work-order-schema';

const PRIORITY_OPTIONS = PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }));

type FieldName = keyof WorkOrderFormInput;

/** Ids fixos: o resumo de erros linka e foca cada campo. */
const FIELD_IDS: Record<FieldName, string> = {
  title: 'order-title',
  description: 'order-description',
  priority: 'order-priority',
  dueDate: 'order-dueDate',
  assigneeId: 'order-assignee',
};
const FIELD_ORDER = Object.keys(FIELD_IDS) as FieldName[];

function isFieldName(field: string): field is FieldName {
  return Object.hasOwn(FIELD_IDS, field);
}

export type AssigneeField =
  | { kind: 'fixed'; name: string }
  | {
      kind: 'select';
      options: { value: string; label: string }[];
      hint?: string;
      disabled?: boolean;
    };

type Props = {
  schema?: typeof editWorkOrderSchema;
  defaultValues: WorkOrderFormInput;
  /** Prioridade e prazo travados (operador na edição), com a explicação. */
  planningLockedHint?: string;
  minDueDate?: string;
  dueDateHint?: string;
  assignee?: AssigneeField;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
  /** Recebe os valores válidos; se rejeitar, o erro aparece no formulário. */
  onSubmit: (values: WorkOrderFormOutput) => Promise<void>;
  /** Aviso sem erro (ex.: "nada mudou"), mostrado acima dos botões. */
  notice?: ReactNode;
};

/**
 * Formulário de ordem usado na criação e na edição. Valida ao sair do campo e no envio
 * (react-hook-form + zod). Erros 400 da API vão para o campo pelo `field` do `details`, e
 * qualquer outro erro (403, 409...) aparece no resumo sem apagar o que foi digitado.
 */
export function WorkOrderForm({
  schema = editWorkOrderSchema,
  defaultValues,
  planningLockedHint,
  minDueDate,
  dueDateHint,
  assignee,
  submitLabel,
  pendingLabel,
  cancelHref,
  onSubmit,
  notice,
}: Props) {
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<WorkOrderFormInput, unknown, WorkOrderFormOutput>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onTouched',
    // O foco vai para o resumo de erros, que tem um link para cada campo.
    shouldFocusError: false,
  });
  const [formError, setFormError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const descriptionLength = (useWatch({ control, name: 'description' }) ?? '').length;

  function applyServerError(error: unknown) {
    if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') {
      setFormError(error);
      return;
    }
    let unmatched = error.details.length === 0;
    for (const detail of error.details) {
      if (isFieldName(detail.field)) {
        setError(detail.field, {
          type: 'server',
          message: FIELD_ERROR_MESSAGES[detail.field] ?? ERROR_MESSAGES.VALIDATION_ERROR,
        });
      } else {
        unmatched = true;
      }
    }
    // Erro num campo que este formulário não tem: o resumo mostra a mensagem geral.
    if (unmatched) setFormError(error);
  }

  async function submit(values: WorkOrderFormOutput) {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      applyServerError(error);
      setAttempt((value) => value + 1);
    }
  }

  const summary: SummaryError[] = [
    ...FIELD_ORDER.flatMap((name) => {
      const message = errors[name]?.message;
      return message ? [{ fieldId: FIELD_IDS[name], message }] : [];
    }),
    ...(formError ? [{ message: errorMessage(formError) }] : []),
  ];

  const planningLocked = planningLockedHint !== undefined;

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => void handleSubmit(submit, () => setAttempt((value) => value + 1))(event)}
    >
      <ErrorSummary errors={summary} attempt={attempt} />

      <TextField
        id={FIELD_IDS.title}
        label="Título"
        maxLength={TITLE_MAX}
        autoComplete="off"
        error={errors.title?.message}
        {...register('title')}
      />

      <TextAreaField
        id={FIELD_IDS.description}
        label="Descrição (opcional)"
        rows={5}
        hint={`${descriptionLength} de ${DESCRIPTION_MAX} caracteres`}
        error={errors.description?.message}
        {...register('description')}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id={FIELD_IDS.priority}
          label="Prioridade"
          options={PRIORITY_OPTIONS}
          disabled={planningLocked}
          hint={planningLockedHint}
          error={errors.priority?.message}
          {...register('priority')}
        />
        <TextField
          id={FIELD_IDS.dueDate}
          label="Prazo"
          type="date"
          min={minDueDate}
          disabled={planningLocked}
          hint={planningLocked ? planningLockedHint : dueDateHint}
          error={errors.dueDate?.message}
          {...register('dueDate')}
        />
      </div>

      {assignee?.kind === 'fixed' && (
        <div>
          <p className="mb-1 text-sm font-medium">Responsável</p>
          <p className="rounded-control border border-border bg-surface-muted px-3 py-2 text-sm">
            {assignee.name} (você)
          </p>
          <p className="mt-1 text-sm text-muted">
            Operadores criam ordens para si mesmos. Um supervisor pode passar a ordem para outra
            pessoa depois.
          </p>
        </div>
      )}
      {assignee?.kind === 'select' && (
        <SelectField
          id={FIELD_IDS.assigneeId}
          label="Responsável"
          options={assignee.options}
          disabled={assignee.disabled}
          hint={assignee.hint}
          error={errors.assigneeId?.message}
          {...register('assigneeId')}
        />
      )}

      {notice}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? pendingLabel : submitLabel}
        </Button>
        <Link
          to={cancelHref}
          className="px-2 text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          Voltar sem salvar
        </Link>
      </div>
    </form>
  );
}
