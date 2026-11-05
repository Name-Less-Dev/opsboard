import { todayDateInput } from '../../../lib/dates';
import { toApiQuery, type ListParams } from '../list-params';

// Funções puras da exportação e da importação CSV: sem fetch, sem DOM, sem React.

/** Mesmo limite da API (1 MB): o arquivo maior é recusado antes do envio. */
export const MAX_IMPORT_BYTES = 1024 * 1024;

export const TEMPLATE_FILENAME = 'opsboard-modelo-importacao.csv';
export const FALLBACK_EXPORT_FILENAME = 'opsboard-ordens.csv';
const BOM = String.fromCharCode(0xfeff);
export const IMPORT_HEADER = ['title', 'description', 'priority', 'dueDate', 'assigneeEmail'];

/** A query da lista sem paginação: a exportação leva todos os resultados filtrados. */
export function buildExportQuery(params: ListParams): URLSearchParams {
  const query = toApiQuery(params);
  query.delete('page');
  query.delete('pageSize');
  return query;
}

/**
 * Nome do arquivo no `Content-Disposition` (`attachment; filename="x.csv"`). Aceita também a
 * forma `filename*=UTF-8''x.csv`. Sem nome legível, usa o padrão.
 */
export function filenameFromContentDisposition(
  header: string | null,
  fallback = FALLBACK_EXPORT_FILENAME,
): string {
  if (!header) return fallback;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return sanitizeFilename(decodeURIComponent(encoded[1].trim()), fallback);
    } catch {
      // Codificação quebrada: tenta a forma simples abaixo.
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(header);
  return sanitizeFilename((plain?.[1] ?? plain?.[2] ?? '').trim(), fallback);
}

// O nome vira o `download` de um link: barras não fazem sentido e o vazio cai no padrão.
function sanitizeFilename(name: string, fallback: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  return base === '' ? fallback : base;
}

/**
 * Modelo em branco com BOM (para o Excel acertar os acentos), separador `;`, o cabeçalho e uma
 * linha de exemplo com prazo daqui a 30 dias. Sem responsável, para importar sem erro em qualquer base.
 */
export function buildTemplateCsv(now: Date = new Date()): string {
  const due = todayDateInput(new Date(now.getTime() + 30 * 86_400_000));
  const example = ['Trocar filtro do ar-condicionado', 'Sala 2, filtro G4', 'Alta', due, ''];
  return `${BOM}${IMPORT_HEADER.join(';')}\r\n${example.join(';')}\r\n`;
}

/** Validação feita no navegador antes de enviar: extensão e tamanho. `null` = pode enviar. */
export function validateCsvFile(file: Pick<File, 'name' | 'size'>): string | null {
  if (!/\.csv$/i.test(file.name.trim())) {
    return 'Escolha um arquivo com extensão .csv.';
  }
  if (file.size === 0) {
    return 'O arquivo está vazio.';
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return 'O arquivo passa de 1 MB. Divida em arquivos menores.';
  }
  return null;
}
