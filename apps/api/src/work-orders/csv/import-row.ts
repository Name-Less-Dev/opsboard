import { DateTime } from 'luxon';
import { WorkOrderPriority } from '../../generated/prisma/enums';
import { PRIORITY_LABELS } from './csv-labels';
import { IMPORT_COLUMNS, type ImportColumn, type ImportRecord } from './import-file';

// Validação de cada linha da importação, em funções puras. O "agora", o fuso e os e-mails
// conhecidos chegam por parâmetro. As regras são as da criação normal (CreateWorkOrderDto).

export const ROW_ERROR_CODES = [
  'REQUIRED',
  'TOO_SHORT',
  'TOO_LONG',
  'INVALID_ENUM',
  'INVALID_DATE',
  'DATE_IN_PAST',
  'UNKNOWN_ASSIGNEE',
] as const;
export type RowErrorCode = (typeof ROW_ERROR_CODES)[number];

export type RowError = {
  row: number;
  column: ImportColumn | null;
  code: RowErrorCode;
  message: string;
};

export type FieldResult<T> = { ok: true; value: T } | { ok: false; code: RowErrorCode };

export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const MAX_REPORTED_ERRORS = 100;

/** Sem acento e em minúsculas: "Média", "MEDIA" e "média" viram "media". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

const PRIORITY_BY_TEXT = new Map<string, WorkOrderPriority>(
  Object.values(WorkOrderPriority).flatMap((priority): [string, WorkOrderPriority][] => [
    [fold(priority), priority],
    [fold(PRIORITY_LABELS[priority]), priority],
  ]),
);

/** Aceita o enum (`HIGH`) ou o rótulo (`Alta`), sem diferenciar maiúsculas e acentos. */
export function parsePriority(value: string | undefined): FieldResult<WorkOrderPriority> {
  const text = value?.trim() ?? '';
  if (text === '') return { ok: false, code: 'REQUIRED' };
  const priority = PRIORITY_BY_TEXT.get(fold(text));
  return priority ? { ok: true, value: priority } : { ok: false, code: 'INVALID_ENUM' };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Mesma exigência da criação: data, hora e fuso explícito (Z ou offset).
const DATE_TIME_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * `AAAA-MM-DD` vale o fim desse dia no fuso da aplicação (o prazo "dia 10" inclui o dia 10).
 * ISO completo precisa de fuso. O prazo pode ser exatamente "agora", não antes.
 */
export function parseDueDate(
  value: string | undefined,
  now: Date,
  timezone: string,
): FieldResult<Date> {
  const text = value?.trim() ?? '';
  if (text === '') return { ok: false, code: 'REQUIRED' };

  let parsed: DateTime;
  if (DATE_ONLY.test(text)) {
    parsed = DateTime.fromISO(text, { zone: timezone }).endOf('day');
  } else if (DATE_TIME_WITH_ZONE.test(text)) {
    parsed = DateTime.fromISO(text, { setZone: true });
  } else {
    return { ok: false, code: 'INVALID_DATE' };
  }
  // O Luxon marca como inválida uma data que não existe, como 2026-02-31.
  if (!parsed.isValid) return { ok: false, code: 'INVALID_DATE' };

  const date = parsed.toJSDate();
  return date.getTime() < now.getTime()
    ? { ok: false, code: 'DATE_IN_PAST' }
    : { ok: true, value: date };
}

/** Dados de uma linha válida, prontos para a criação. */
export type ImportedOrder = {
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  dueDate: Date;
  assigneeId: string | null;
};

export type RowContext = {
  now: Date;
  timezone: string;
  /** E-mail em minúsculas → id do usuário. Basta conter os e-mails citados no arquivo. */
  usersByEmail: ReadonlyMap<string, string>;
};

const MESSAGES: Record<ImportColumn, Partial<Record<RowErrorCode, string>>> = {
  title: {
    REQUIRED: 'O título é obrigatório.',
    TOO_SHORT: `O título precisa ter pelo menos ${TITLE_MIN} caracteres.`,
    TOO_LONG: `O título pode ter no máximo ${TITLE_MAX} caracteres.`,
  },
  description: {
    TOO_LONG: `A descrição pode ter no máximo ${DESCRIPTION_MAX} caracteres.`,
  },
  priority: {
    REQUIRED: 'A prioridade é obrigatória.',
    INVALID_ENUM: 'Prioridade inválida: use Baixa, Média, Alta ou Urgente.',
  },
  dueDate: {
    REQUIRED: 'O prazo é obrigatório.',
    INVALID_DATE: 'Prazo inválido: use AAAA-MM-DD ou data e hora com fuso.',
    DATE_IN_PAST: 'O prazo não pode estar no passado.',
  },
  assigneeEmail: {
    UNKNOWN_ASSIGNEE: 'Nenhum usuário com este e-mail.',
  },
};

function rowError(row: number, column: ImportColumn, code: RowErrorCode): RowError {
  return { row, column, code, message: MESSAGES[column][code] ?? 'Valor inválido.' };
}

/** E-mail como chave de busca: trim e minúsculas. Vazio vira null (sem responsável). */
export function normalizeEmail(value: string | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? '';
  return email === '' ? null : email;
}

/** Valida todos os campos da linha e devolve todos os erros, não só o primeiro. */
export function validateRow(
  record: ImportRecord,
  context: RowContext,
): { ok: true; value: ImportedOrder } | { ok: false; errors: RowError[] } {
  const { rowNumber, values } = record;
  const errors: RowError[] = [];

  const title = values.title?.trim() ?? '';
  if (title === '') errors.push(rowError(rowNumber, 'title', 'REQUIRED'));
  else if (title.length < TITLE_MIN) errors.push(rowError(rowNumber, 'title', 'TOO_SHORT'));
  else if (title.length > TITLE_MAX) errors.push(rowError(rowNumber, 'title', 'TOO_LONG'));

  const description = values.description?.trim() ?? '';
  if (description.length > DESCRIPTION_MAX) {
    errors.push(rowError(rowNumber, 'description', 'TOO_LONG'));
  }

  const priority = parsePriority(values.priority);
  if (!priority.ok) errors.push(rowError(rowNumber, 'priority', priority.code));

  const dueDate = parseDueDate(values.dueDate, context.now, context.timezone);
  if (!dueDate.ok) errors.push(rowError(rowNumber, 'dueDate', dueDate.code));

  const email = normalizeEmail(values.assigneeEmail);
  // undefined = e-mail informado que não existe; null = sem responsável.
  const assigneeId = email === null ? null : context.usersByEmail.get(email);
  if (assigneeId === undefined) {
    errors.push(rowError(rowNumber, 'assigneeEmail', 'UNKNOWN_ASSIGNEE'));
  }

  if (!priority.ok || !dueDate.ok || assigneeId === undefined || errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      title,
      description: description === '' ? null : description,
      priority: priority.value,
      dueDate: dueDate.value,
      assigneeId,
    },
  };
}

export type ImportReport = {
  valid: boolean;
  totalRows: number;
  validRows: number;
  totalErrors: number;
  errors: RowError[];
};

const COLUMN_ORDER = new Map<ImportColumn, number>(
  IMPORT_COLUMNS.map((column, index) => [column, index]),
);
const columnPosition = (column: ImportColumn | null) =>
  column === null ? -1 : (COLUMN_ORDER.get(column) ?? 0);

/**
 * Resumo da validação: erros em ordem de linha e de coluna, cortados em 100, com o total real.
 * Linha válida é a que não tem nenhum erro.
 */
export function buildReport(totalRows: number, errors: readonly RowError[]): ImportReport {
  const sorted = [...errors].sort(
    (a, b) => a.row - b.row || columnPosition(a.column) - columnPosition(b.column),
  );
  const rowsWithErrors = new Set(errors.map((error) => error.row)).size;
  return {
    valid: errors.length === 0,
    totalRows,
    validRows: totalRows - rowsWithErrors,
    totalErrors: errors.length,
    errors: sorted.slice(0, MAX_REPORTED_ERRORS),
  };
}
