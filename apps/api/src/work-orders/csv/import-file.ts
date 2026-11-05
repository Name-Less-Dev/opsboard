import { CsvError, parse } from 'csv-parse/sync';

// Leitura do arquivo de importação em funções puras: bytes → texto → cabeçalho → registros.
// Cada função devolve `{ ok: false, message }` em vez de lançar, e o service traduz isso em
// 400 IMPORT_FILE_INVALID. As mensagens já são as que a pessoa vê.

export const IMPORT_COLUMNS = [
  'title',
  'description',
  'priority',
  'dueDate',
  'assigneeEmail',
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export const REQUIRED_COLUMNS: readonly ImportColumn[] = ['title', 'priority'];

export type Delimiter = ';' | ',';

export type FileResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** Uma linha de dados do arquivo; `rowNumber` conta o cabeçalho como linha 1. */
export type ImportRecord = {
  rowNumber: number;
  values: Partial<Record<ImportColumn, string>>;
};

const UTF8_HINT = 'Salve como CSV UTF-8 e envie de novo.';

/** Decodifica UTF-8 recusando bytes inválidos (ex.: Latin-1 do Excel antigo). Tira o BOM. */
export function decodeUtf8Strict(bytes: Uint8Array): FileResult<string> {
  try {
    // `fatal` lança no primeiro byte inválido; `ignoreBOM: false` remove o BOM do começo.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
    return { ok: true, value: text };
  } catch {
    return { ok: false, message: `O arquivo não está em UTF-8. ${UTF8_HINT}` };
  }
}

/**
 * Escolhe o separador pela linha de cabeçalho: o que aparecer mais vezes entre `;` e `,`.
 * Empate (inclusive nenhum dos dois) fica com `;`, o padrão do Excel em português.
 */
export function detectDelimiter(headerLine: string): Delimiter {
  const count = (char: string) => headerLine.split(char).length - 1;
  return count(',') > count(';') ? ',' : ';';
}

const BY_LOWERCASE = new Map(IMPORT_COLUMNS.map((column) => [column.toLowerCase(), column]));

/** Confere o cabeçalho e devolve a posição de cada coluna. Nomes com trim e sem diferenciar maiúsculas. */
export function validateHeader(cells: readonly string[]): FileResult<ImportColumn[]> {
  const columns: ImportColumn[] = [];
  for (const cell of cells) {
    const name = cell.trim();
    const column = BY_LOWERCASE.get(name.toLowerCase());
    if (!column) {
      return {
        ok: false,
        message: name
          ? `Coluna desconhecida no cabeçalho: "${name}". Use só ${IMPORT_COLUMNS.join(', ')}.`
          : `O cabeçalho tem uma coluna sem nome. Use só ${IMPORT_COLUMNS.join(', ')}.`,
      };
    }
    if (columns.includes(column)) {
      return { ok: false, message: `A coluna "${column}" aparece mais de uma vez no cabeçalho.` };
    }
    columns.push(column);
  }
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Faltam colunas obrigatórias no cabeçalho: ${missing.join(', ')}.`,
    };
  }
  return { ok: true, value: columns };
}

function isBlank(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === '');
}

/**
 * Do arquivo bruto à lista de registros. Linhas totalmente vazias são ignoradas, mas contam na
 * numeração, para o número bater com a linha que a pessoa vê na planilha.
 */
export function parseImportFile(bytes: Uint8Array, maxRows: number): FileResult<ImportRecord[]> {
  const decoded = decodeUtf8Strict(bytes);
  if (!decoded.ok) return decoded;
  const text = decoded.value;
  if (text.trim() === '') {
    return { ok: false, message: 'O arquivo está vazio.' };
  }

  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0]);
  let rows: string[][];
  try {
    rows = parse(text, {
      delimiter,
      // A contagem de colunas é conferida aqui embaixo, com mensagem própria.
      relax_column_count: true,
      skip_empty_lines: false,
    });
  } catch (error) {
    if (error instanceof CsvError) {
      const where = typeof error.lines === 'number' ? ` perto da linha ${error.lines}` : '';
      return {
        ok: false,
        message: `CSV malformado${where}: confira as aspas e os separadores.`,
      };
    }
    throw error;
  }

  const [headerCells, ...dataRows] = rows;
  const header = validateHeader(headerCells);
  if (!header.ok) return header;
  const columns = header.value;

  const records: ImportRecord[] = [];
  for (const [index, cells] of dataRows.entries()) {
    const rowNumber = index + 2;
    if (isBlank(cells)) continue;
    if (cells.length !== columns.length) {
      return {
        ok: false,
        message: `A linha ${rowNumber} tem ${cells.length} colunas, mas o cabeçalho tem ${columns.length}.`,
      };
    }
    if (records.length === maxRows) {
      return {
        ok: false,
        message: `O arquivo tem mais de ${maxRows} ordens. Divida em arquivos menores.`,
      };
    }
    const values: Partial<Record<ImportColumn, string>> = {};
    columns.forEach((column, position) => {
      values[column] = cells[position];
    });
    records.push({ rowNumber, values });
  }

  if (records.length === 0) {
    return { ok: false, message: 'O arquivo só tem o cabeçalho, sem nenhuma ordem.' };
  }
  return { ok: true, value: records };
}
