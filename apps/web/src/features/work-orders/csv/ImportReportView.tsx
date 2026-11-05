import type { ImportRowError } from './csv-types';
import { columnLabel, hiddenErrorsNotice, rowErrorMessage } from './import-report';

/**
 * Tabela dos erros por linha. Fica num contêiner que rola sozinho na horizontal (com foco
 * pelo teclado), para a página nunca ganhar rolagem lateral no celular.
 */
export function ImportErrorTable({
  errors,
  totalErrors,
}: {
  errors: ImportRowError[];
  totalErrors: number;
}) {
  if (errors.length === 0) return null;
  const notice = hiddenErrorsNotice({ errors, totalErrors });

  return (
    <div className="space-y-2">
      {notice && (
        <p className="rounded-control border border-control-border bg-surface-muted px-3 py-2 text-sm">
          {notice}
        </p>
      )}
      <div
        role="region"
        aria-labelledby="import-errors-caption"
        tabIndex={0}
        className="max-h-[28rem] overflow-auto rounded-card border border-control-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <table className="w-full border-collapse text-left text-sm">
          <caption id="import-errors-caption" className="px-3 py-2 text-left font-medium">
            Erros por linha do arquivo
          </caption>
          <thead className="sticky top-0 bg-surface-muted">
            <tr>
              <th scope="col" className="w-16 px-3 py-2 font-medium">
                Linha
              </th>
              <th scope="col" className="px-3 py-2 font-medium sm:w-48">
                Coluna
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Mensagem
              </th>
            </tr>
          </thead>
          <tbody>
            {errors.map((error, index) => (
              <tr
                key={`${error.row}-${error.column ?? ''}-${index}`}
                className="border-t border-border"
              >
                <th scope="row" className="px-3 py-2 align-top font-normal tabular-nums">
                  {error.row}
                </th>
                <td className="px-3 py-2 align-top">{columnLabel(error.column)}</td>
                <td className="px-3 py-2 align-top break-words">{rowErrorMessage(error)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
