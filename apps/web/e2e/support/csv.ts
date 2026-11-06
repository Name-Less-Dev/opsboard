import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { localDateFromNow } from './data.ts';

// CSV dos testes. O de importação é gerado em memória, com prazos relativos a "agora" (nunca
// vence). O baixado é lido com o mesmo `csv-parse` da API: escrever um parser à mão aqui seria
// testar o CSV com outra regra de aspas diferente da usada para gerá-lo.

const BOM = String.fromCharCode(0xfeff);

export type ImportRow = { title: string; priority: string; assigneeEmail?: string };

/** Arquivo válido: BOM, `;`, CRLF e prazo daqui a 30 dias. */
export function buildValidImportCsv(rows: ImportRow[]): Buffer {
  const due = localDateFromNow(30);
  const lines = [
    'title;description;priority;dueDate;assigneeEmail',
    ...rows.map((row) =>
      [row.title, 'Importada pelo teste e2e', row.priority, due, row.assigneeEmail ?? ''].join(';'),
    ),
  ];
  return Buffer.from(`${BOM}${lines.join('\r\n')}\r\n`, 'utf8');
}

export type DownloadedCsv = { bytes: Buffer; header: string[]; rows: string[][] };

/** Lê o CSV baixado como bytes (para conferir o BOM) e como linhas. */
export async function readDownloadedCsv(path: string): Promise<DownloadedCsv> {
  const bytes = await readFile(path);
  const records: string[][] = parse(bytes.toString('utf8'), { bom: true, delimiter: ';' });
  const [header, ...rows] = records;
  return { bytes, header, rows };
}
