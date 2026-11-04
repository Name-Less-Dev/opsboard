import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

// Campos com label sempre associado (htmlFor/id gerado por useId) e erro ligado ao campo
// por aria-describedby, para o leitor de tela ler a mensagem junto.

const controlClass =
  'w-full rounded-control border border-control-border bg-surface px-3 py-2 text-sm aria-[invalid=true]:border-danger';

type FieldShellProps = {
  id: string;
  label: string;
  error?: string;
  errorId: string;
  children: ReactNode;
};

function FieldShell({ id, label, error, errorId, children }: FieldShellProps) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  error?: string;
};

export function TextField({ label, error, className = '', ...props }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <FieldShell id={id} label={label} error={error} errorId={errorId}>
      <input
        id={id}
        className={`${controlClass} ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
    </FieldShell>
  );
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  options: readonly { value: string; label: string }[];
};

export function SelectField({ label, options, className = '', ...props }: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} errorId={`${id}-error`}>
      <select id={id} className={`${controlClass} ${className}`} {...props}>
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
