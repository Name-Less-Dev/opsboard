import { Button } from './Button';

/**
 * Aviso de sucesso numa região `role="status"` (o leitor de tela anuncia sem roubar o foco),
 * com botão para dispensar. A região fica sempre no DOM para o anúncio funcionar.
 */
export function FlashMessage({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  return (
    <div role="status">
      {message && (
        <div className="flex items-center justify-between gap-3 rounded-card border border-tone-success-bg bg-tone-success-bg px-4 py-2 text-tone-success-fg">
          <p className="text-sm font-medium">{message}</p>
          <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="Dispensar aviso">
            Dispensar
          </Button>
        </div>
      )}
    </div>
  );
}
