import type { ImportColumn, ImportReport, ImportRowError, ImportRowErrorCode } from './csv-types';

// Texto do relatório de importação. Como no resto do front, a mensagem sai do `code` (e da
// coluna), não do texto da API; o texto da API só aparece para um código que o front não conhece.

export const COLUMN_LABELS: Record<ImportColumn, string> = {
  title: 'título',
  description: 'descrição',
  priority: 'prioridade',
  dueDate: 'prazo',
  assigneeEmail: 'e-mail do responsável',
};

const TOO_LONG: Partial<Record<ImportColumn, string>> = {
  title: 'Use no máximo 120 caracteres.',
  description: 'Use no máximo 2000 caracteres.',
};

const ROW_MESSAGES: Record<ImportRowErrorCode, string> = {
  REQUIRED: 'Campo obrigatório, está vazio.',
  TOO_SHORT: 'Use pelo menos 3 caracteres.',
  TOO_LONG: 'Texto longo demais.',
  INVALID_ENUM: 'Use Baixa, Média, Alta ou Urgente.',
  INVALID_DATE: 'Data inválida. Use AAAA-MM-DD ou data e hora com fuso.',
  DATE_IN_PAST: 'O prazo não pode estar no passado.',
  UNKNOWN_ASSIGNEE: 'Nenhum usuário com este e-mail.',
};

function isKnownCode(code: string): code is ImportRowErrorCode {
  return Object.hasOwn(ROW_MESSAGES, code);
}

export function columnLabel(column: ImportRowError['column']): string {
  return column === null ? 'linha inteira' : (COLUMN_LABELS[column] ?? column);
}

export function rowErrorMessage(error: ImportRowError): string {
  if (!isKnownCode(error.code)) return error.message;
  if (error.code === 'TOO_LONG' && error.column) {
    return TOO_LONG[error.column] ?? ROW_MESSAGES.TOO_LONG;
  }
  return ROW_MESSAGES[error.code];
}

/** "Linha 7, coluna prioridade: Use Baixa, Média, Alta ou Urgente." */
export function describeRowError(error: ImportRowError): string {
  const where =
    error.column === null
      ? `Linha ${error.row}`
      : `Linha ${error.row}, coluna ${columnLabel(error.column)}`;
  return `${where}: ${rowErrorMessage(error)}`;
}

export type RowErrorGroup = { row: number; errors: ImportRowError[] };

/** Erros agrupados por linha, na ordem em que chegaram (a API já ordena por linha e coluna). */
export function groupErrorsByRow(errors: readonly ImportRowError[]): RowErrorGroup[] {
  const groups = new Map<number, ImportRowError[]>();
  for (const error of errors) {
    groups.set(error.row, [...(groups.get(error.row) ?? []), error]);
  }
  return [...groups].map(([row, rowErrors]) => ({ row, errors: rowErrors }));
}

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`;

/** "120 linhas, 118 válidas, 2 com erro". */
export function summarizeReport(report: Pick<ImportReport, 'totalRows' | 'validRows'>): string {
  const withErrors = report.totalRows - report.validRows;
  return [
    plural(report.totalRows, 'linha', 'linhas'),
    plural(report.validRows, 'válida', 'válidas'),
    `${withErrors.toLocaleString('pt-BR')} com erro`,
  ].join(', ');
}

/** Aviso quando a API mandou só parte dos erros (no máximo 100). `null` se vieram todos. */
export function hiddenErrorsNotice(
  report: Pick<ImportReport, 'totalErrors' | 'errors'>,
): string | null {
  const hidden = report.totalErrors - report.errors.length;
  if (hidden <= 0) return null;
  return `Mostrando os primeiros ${report.errors.length} de ${report.totalErrors.toLocaleString('pt-BR')} erros. Corrija estes e valide de novo para ver os demais.`;
}
