import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

// Campos com label sempre associado (htmlFor/id) e dica e erro ligados ao campo por
// aria-describedby, para o leitor de tela ler a mensagem junto. O `ref` (do react-hook-form)
// chega ao elemento nativo pelo `...props`: no React 19, `ref` é uma prop comum.

const controlClass =
  'w-full rounded-control border border-control-border bg-surface px-3 py-2 text-sm aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted';

type ShellProps = {
  /** Id fixo, para links do resumo de erros; sem ele, um id gerado. */
  id?: string;
  label: string;
  hint?: ReactNode;
  error?: string;
};

function useFieldIds({ id, hint, error }: ShellProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return {
    fieldId,
    hintId,
    errorId,
    aria: {
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy || undefined,
    },
  };
}

function FieldShell({
  label,
  hint,
  error,
  ids,
  children,
}: ShellProps & { ids: ReturnType<typeof useFieldIds>; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={ids.fieldId} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && (
        <p id={ids.hintId} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={ids.errorId} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & ShellProps;

export function TextField({ id, label, hint, error, className = '', ...props }: TextFieldProps) {
  const ids = useFieldIds({ id, label, hint, error });
  return (
    <FieldShell label={label} hint={hint} error={error} ids={ids}>
      <input id={ids.fieldId} className={`${controlClass} ${className}`} {...ids.aria} {...props} />
    </FieldShell>
  );
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & ShellProps;

export function TextAreaField({
  id,
  label,
  hint,
  error,
  className = '',
  ...props
}: TextAreaFieldProps) {
  const ids = useFieldIds({ id, label, hint, error });
  return (
    <FieldShell label={label} hint={hint} error={error} ids={ids}>
      <textarea
        id={ids.fieldId}
        className={`${controlClass} min-h-28 ${className}`}
        {...ids.aria}
        {...props}
      />
    </FieldShell>
  );
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> &
  ShellProps & {
    options: readonly { value: string; label: string }[];
  };

export function SelectField({
  id,
  label,
  hint,
  error,
  options,
  className = '',
  ...props
}: SelectFieldProps) {
  const ids = useFieldIds({ id, label, hint, error });
  return (
    <FieldShell label={label} hint={hint} error={error} ids={ids}>
      <select id={ids.fieldId} className={`${controlClass} ${className}`} {...ids.aria} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
  label: string;
};

export function Checkbox({ label, ...props }: CheckboxProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" className="size-4 shrink-0 accent-primary" {...props} />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}

/** Grupo de checkboxes dentro de fieldset/legend: o leitor de tela anuncia o nome do grupo. */
export function CheckboxGroup<T extends string>({
  legend,
  options,
  selected,
  onChange,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  selected: readonly T[];
  onChange: (selected: T[]) => void;
}) {
  function toggle(value: T, checked: boolean) {
    const next = checked ? [...selected, value] : selected.filter((item) => item !== value);
    // Mantém a ordem das opções, não a ordem dos cliques.
    onChange(options.map((option) => option.value).filter((item) => next.includes(item)));
  }

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((option) => (
          <Checkbox
            key={option.value}
            label={option.label}
            checked={selected.includes(option.value)}
            onChange={(event) => toggle(option.value, event.target.checked)}
          />
        ))}
      </div>
    </fieldset>
  );
}
