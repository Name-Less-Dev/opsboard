import { useId } from 'react';
import { Button } from '../../../components/Button';
import { Spinner } from '../../../components/Spinner';
import { errorMessage } from '../../../lib/error-messages';
import type { ListParams } from '../list-params';
import { exportHint } from './csv-files';
import { useExportWorkOrders } from './use-csv';

/**
 * "Exportar CSV" com os filtros atuais da URL. `total` é o da lista na tela (null enquanto
 * atualiza). Fica desabilitado durante o download, e o erro aparece logo abaixo, pelo `code`.
 */
export function ExportCsvButton({
  params,
  total,
  disabled = false,
}: {
  params: ListParams;
  total: number | null;
  disabled?: boolean;
}) {
  const exportCsv = useExportWorkOrders();
  const hintId = useId();

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Button
        size="sm"
        aria-describedby={hintId}
        disabled={disabled || exportCsv.isPending || total === 0}
        onClick={() => exportCsv.mutate(params)}
      >
        {exportCsv.isPending && <Spinner />}
        {exportCsv.isPending ? 'Exportando…' : 'Exportar CSV'}
      </Button>
      <p id={hintId} className="text-xs text-muted">
        {exportHint(total)}
      </p>
      {/* Inserido já com o texto: `role="alert"` é anunciado na hora, como no ErrorState. */}
      {exportCsv.isError && (
        <p role="alert" className="max-w-xs text-sm text-danger sm:text-right">
          {errorMessage(exportCsv.error)}
        </p>
      )}
    </div>
  );
}
