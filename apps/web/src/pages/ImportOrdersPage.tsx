import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { useAuth } from '../features/auth/auth-context';
import { validateCsvFile } from '../features/work-orders/csv/csv-files';
import type { ImportRowError } from '../features/work-orders/csv/csv-types';
import { summarizeReport } from '../features/work-orders/csv/import-report';
import { ImportErrorTable } from '../features/work-orders/csv/ImportReportView';
import {
  downloadTemplate,
  useImportWorkOrders,
  useValidateImport,
} from '../features/work-orders/csv/use-csv';
import { ApiError } from '../lib/api';
import { errorMessage, isUnexpectedError } from '../lib/error-messages';
import { formatCount } from '../lib/format';
import type { FlashState } from '../lib/use-flash';

const backLink = 'text-sm font-medium text-primary underline-offset-2 hover:underline';

/** Erro do arquivo (400) vem com o motivo exato no texto da API, que é mostrado como está. */
function isFileError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'IMPORT_FILE_INVALID';
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} bytes` : `${Math.ceil(bytes / 1024).toLocaleString('pt-BR')} KB`;
}

/** Mensagem de erro em destaque. Em erro inesperado, mostra o código para o suporte. */
function ErrorBox({ error }: { error: unknown }) {
  const requestId = isUnexpectedError(error) ? error.requestId : null;
  const message = isFileError(error) ? error.message : errorMessage(error);
  return (
    <div role="alert" className="rounded-card border border-danger-border bg-danger-bg px-4 py-3">
      <p className="font-medium text-danger">
        {isFileError(error) ? 'O arquivo não pode ser importado. ' : ''}
        {message}
      </p>
      {requestId && (
        <p className="mt-1 text-xs text-muted">
          Código para o suporte: <code className="break-all select-all">{requestId}</code>
        </p>
      )}
    </div>
  );
}

function AccessDenied() {
  return (
    <main className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Importar ordens</h1>
      <div role="alert" className="rounded-card border border-border bg-surface p-4">
        <p className="font-medium">Acesso negado.</p>
        <p className="mt-1 text-sm text-muted">
          Somente supervisores podem importar ordens. Se precisar importar, peça a um supervisor.
        </p>
      </div>
      <Link to="/orders" className={backLink}>
        ← Voltar para a lista
      </Link>
    </main>
  );
}

/**
 * Importação em duas etapas: escolher e validar (`dryRun=true`), ver o relatório e só então
 * importar. "Importar" exige uma validação sem erros do MESMO arquivo que está escolhido.
 */
export function ImportOrdersPage() {
  const { user } = useAuth();
  if (user?.role !== 'SUPERVISOR') return <AccessDenied />;
  return <ImportForm />;
}

function ImportForm() {
  const navigate = useNavigate();
  const validate = useValidateImport();
  const importing = useImportWorkOrders();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [validatedFile, setValidatedFile] = useState<File | null>(null);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  const report = validate.data && validatedFile === file ? validate.data : null;
  // 422 na importação real: a API recusou (algo mudou desde a validação). Mesmo relatório.
  const rejected =
    importing.error instanceof ApiError && importing.error.code === 'IMPORT_INVALID'
      ? importing.error
      : null;
  const otherError = rejected ? null : (validate.error ?? importing.error);
  const canImport = report?.valid === true && !importing.isPending && !importing.isSuccess;

  // Resultado novo (relatório ou recusa): foco no resumo, que o leitor de tela lê em seguida.
  useEffect(() => {
    if (report || rejected) summaryRef.current?.focus();
  }, [report, rejected]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    // Arquivo trocado: a validação anterior não vale mais para ele.
    validate.reset();
    importing.reset();
    setValidatedFile(null);
    setFile(chosen);
    setFileError(chosen ? validateCsvFile(chosen) : null);
  }

  function runValidation(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setFileError('Escolha um arquivo .csv.');
      return;
    }
    const problem = validateCsvFile(file);
    setFileError(problem);
    if (problem || validate.isPending) return;
    importing.reset();
    const current = file;
    validate.mutate(current, { onSuccess: () => setValidatedFile(current) });
  }

  function runImport() {
    if (!file || !canImport) return;
    importing.mutate(file, {
      onSuccess: ({ imported }) => {
        const flash: FlashState = {
          flash: `${formatCount(imported, 'ordem importada', 'ordens importadas')}.`,
        };
        void navigate('/orders', { state: flash });
      },
    });
  }

  const rowErrors: ImportRowError[] = rejected ? rejected.rowErrors : (report?.errors ?? []);
  const totalErrors = rejected ? rejected.totalErrors : (report?.totalErrors ?? 0);

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <Link to="/orders" className={backLink}>
        ← Voltar para a lista
      </Link>
      <h1 className="text-2xl font-semibold">Importar ordens</h1>

      <section
        aria-labelledby="import-help"
        className="space-y-3 rounded-card border border-border bg-surface p-4 sm:p-6"
      >
        <h2 id="import-help" className="text-lg font-semibold">
          Como montar o arquivo
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>
            Primeira linha com os nomes das colunas: <code>title</code> e <code>priority</code> são
            obrigatórias; <code>description</code>, <code>dueDate</code> e{' '}
            <code>assigneeEmail</code> são opcionais.
          </li>
          <li>Prioridade: Baixa, Média, Alta ou Urgente.</li>
          <li>
            Prazo obrigatório em cada linha, no formato <code>AAAA-MM-DD</code> (vale até o fim do
            dia) e nunca no passado.
          </li>
          <li>Responsável pelo e-mail do usuário; vazio deixa a ordem sem responsável.</li>
          <li>
            Separador <code>;</code> ou <code>,</code>. Até 500 linhas e 1 MB. Toda ordem importada
            nasce aberta, e o arquivo é tudo ou nada: com qualquer erro, nada é gravado.
          </li>
        </ul>
        <p className="text-sm">
          Exemplo:{' '}
          <code className="break-all">Trocar filtro;Sala 2;Alta;2026-12-10;ana@empresa.com</code>
        </p>
        <p className="rounded-control border border-control-border bg-surface-muted px-3 py-2 text-sm">
          <strong>Usa Excel?</strong> Salve como{' '}
          <strong>CSV UTF-8 (delimitado por vírgulas)</strong>. O formato "CSV" comum estraga os
          acentos.
        </p>
        <Button size="sm" onClick={() => downloadTemplate()}>
          Baixar modelo
        </Button>
      </section>

      <form onSubmit={runValidation} noValidate className="space-y-4">
        <div>
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
            Arquivo CSV
          </label>
          <input
            id={inputId}
            type="file"
            accept=".csv,text/csv"
            onChange={chooseFile}
            aria-invalid={fileError ? true : undefined}
            aria-describedby={[hintId, fileError ? errorId : null].filter(Boolean).join(' ')}
            className="block w-full max-w-full text-sm file:mr-3 file:rounded-control file:border file:border-control-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-surface-muted"
          />
          <p id={hintId} className="mt-1 text-sm break-all text-muted">
            {file
              ? `Arquivo escolhido: ${file.name} (${formatSize(file.size)})`
              : 'Nenhum arquivo escolhido. Arquivo .csv de até 1 MB.'}
          </p>
          {fileError && (
            <p id={errorId} className="mt-1 text-sm text-danger">
              {fileError}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={validate.isPending || importing.isPending}>
            {validate.isPending && <Spinner />}
            {validate.isPending ? 'Validando…' : 'Validar arquivo'}
          </Button>
          <Button variant="primary" onClick={runImport} disabled={!canImport}>
            {importing.isPending && <Spinner />}
            {importing.isPending
              ? 'Importando…'
              : report?.valid
                ? `Importar ${formatCount(report.validRows, 'ordem', 'ordens')}`
                : 'Importar'}
          </Button>
        </div>
        {!canImport && !importing.isPending && (
          <p className="text-sm text-muted">
            {report && !report.valid
              ? 'Corrija os erros no arquivo, escolha-o de novo e valide antes de importar.'
              : 'Valide o arquivo para liberar a importação.'}
          </p>
        )}
      </form>

      {otherError && !validate.isPending && !importing.isPending && <ErrorBox error={otherError} />}

      {/* Sempre no DOM: a região precisa existir antes do resumo para ele ser anunciado. */}
      <div aria-live="polite" className="space-y-3">
        {(report || rejected) && (
          <>
            <h2
              id="import-result"
              ref={summaryRef}
              tabIndex={-1}
              className="text-lg font-semibold outline-none"
            >
              {rejected
                ? `Nada foi importado: o arquivo tem ${formatCount(rejected.totalErrors, 'erro', 'erros')}.`
                : report?.valid
                  ? `Arquivo válido: ${summarizeReport(report)}.`
                  : `Arquivo com erros: ${report ? summarizeReport(report) : ''}.`}
            </h2>
            {report?.valid && (
              <p className="text-sm text-muted">
                Nada foi gravado ainda. Confira e clique em "Importar" para criar as ordens.
              </p>
            )}
            <ImportErrorTable errors={rowErrors} totalErrors={totalErrors} />
          </>
        )}
      </div>
    </main>
  );
}
