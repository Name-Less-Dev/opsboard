import { useEffect, useRef } from 'react';

export type SummaryError = { fieldId?: string; message: string };

/**
 * Resumo dos erros no topo do formulário. Recebe o foco quando aparece (ou muda a cada envio
 * com erro), então o leitor de tela lê tudo de uma vez; cada item é um link que leva ao campo.
 */
export function ErrorSummary({ errors, attempt }: { errors: SummaryError[]; attempt: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const focusedAttempt = useRef(0);
  const hasErrors = errors.length > 0;

  // `attempt` muda a cada envio com erro, às vezes uma renderização antes de os erros chegarem.
  // O foco vai para o resumo uma vez por tentativa, quando os dois já valem; erros que aparecem
  // ao sair de um campo não roubam o foco.
  useEffect(() => {
    if (hasErrors && attempt > 0 && focusedAttempt.current !== attempt) {
      focusedAttempt.current = attempt;
      ref.current?.focus();
    }
  }, [attempt, hasErrors]);

  if (errors.length === 0) return null;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      aria-labelledby="error-summary-title"
      className="rounded-card border border-danger-border bg-danger-bg px-4 py-3 outline-none focus-visible:outline-2"
    >
      <p id="error-summary-title" className="font-medium text-danger">
        {errors.length === 1
          ? 'Corrija o erro abaixo:'
          : `Corrija os ${errors.length} erros abaixo:`}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {errors.map((error) => (
          <li key={`${error.fieldId ?? ''}-${error.message}`}>
            {error.fieldId ? (
              <a
                href={`#${error.fieldId}`}
                className="text-danger underline underline-offset-2"
                onClick={(event) => {
                  // Foca o campo (o link sozinho só rolaria até ele).
                  event.preventDefault();
                  document.getElementById(error.fieldId ?? '')?.focus();
                }}
              >
                {error.message}
              </a>
            ) : (
              error.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
