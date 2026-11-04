import { errorMessage, isUnexpectedError } from '../lib/error-messages';
import { Button } from './Button';

/**
 * Erro com "Tentar de novo". A mensagem vem do `code` (lib/error-messages.ts); o `requestId`
 * só aparece em erro inesperado, para a pessoa informar ao suporte.
 */
export function ErrorState({
  error,
  onRetry,
  retrying = false,
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const requestId = isUnexpectedError(error) ? error.requestId : null;

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-card border border-danger-border bg-danger-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-medium text-danger">{errorMessage(error)}</p>
        {requestId && (
          <p className="mt-1 text-xs text-muted">
            Código para o suporte: <code className="break-all select-all">{requestId}</code>
          </p>
        )}
      </div>
      <Button size="sm" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Tentando…' : 'Tentar de novo'}
      </Button>
    </div>
  );
}
