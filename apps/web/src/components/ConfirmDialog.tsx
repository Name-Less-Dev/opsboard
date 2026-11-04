import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { Button } from './Button';

/**
 * Confirmação com o `<dialog>` nativo: `showModal()` prende o foco dentro e deixa o resto da
 * página inerte. Abre com o foco em "Voltar" (a opção segura), fecha com Esc e devolve o foco
 * ao botão que abriu; se ele não existir mais, ao `returnFocusFallback`.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pendingLabel,
  pending = false,
  onConfirm,
  onClose,
  returnFocusFallback,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  returnFocusFallback?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      backRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function restoreFocus() {
    const target = opener.current?.isConnected ? opener.current : returnFocusFallback?.current;
    target?.focus();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-card border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/50"
      // Esc dispara `cancel`: quem fecha é o estado do React (e nada fecha durante o envio).
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      onClose={() => {
        restoreFocus();
        // Fechou por fora do React (ex.: o navegador ignorou o preventDefault num Esc repetido).
        if (open) onClose();
      }}
    >
      <div className="space-y-4 p-5">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <div id={descriptionId} className="space-y-2 text-sm text-muted">
          {children}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button ref={backRef} onClick={onClose} disabled={pending}>
            Voltar
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
