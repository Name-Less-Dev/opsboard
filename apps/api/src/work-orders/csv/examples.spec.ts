import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseImportFile } from './import-file';
import { ROW_ERROR_CODES, buildReport, validateRow, type RowError } from './import-row';

// Os arquivos de docs/examples são usados no README e nos testes de ponta a ponta: este teste
// garante que continuam batendo com as regras (o válido sem erros, o outro com todos os códigos).
const NOW = new Date('2026-11-05T15:00:00.000Z');
const SEED_USERS = new Map([
  ['supervisor@opsboard.dev', 'id-supervisor'],
  ['ana@opsboard.dev', 'id-ana'],
  ['bruno@opsboard.dev', 'id-bruno'],
]);

function report(name: string) {
  const bytes = readFileSync(join(__dirname, '../../../../../docs/examples', name));
  const parsed = parseImportFile(bytes, 500);
  if (!parsed.ok) throw new Error(parsed.message);
  const errors: RowError[] = parsed.value.flatMap((record) => {
    const result = validateRow(record, {
      now: NOW,
      timezone: 'America/Sao_Paulo',
      usersByEmail: SEED_USERS,
    });
    return result.ok ? [] : result.errors;
  });
  return { bytes, report: buildReport(parsed.value.length, errors) };
}

describe('arquivos de exemplo (docs/examples)', () => {
  it('ordens-exemplo.csv é todo válido, com BOM e CRLF', () => {
    const { bytes, report: result } = report('ordens-exemplo.csv');
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString('utf8')).toContain('\r\n');
    expect(result).toMatchObject({ valid: true, totalRows: 5, validRows: 5, totalErrors: 0 });
  });

  it('ordens-com-erros.csv tem pelo menos um erro de cada código de linha', () => {
    const { report: result } = report('ordens-com-erros.csv');
    expect(result.valid).toBe(false);
    expect(new Set(result.errors.map((error) => error.code))).toEqual(new Set(ROW_ERROR_CODES));
    expect(result).toMatchObject({ totalRows: 11, validRows: 2 });
  });
});
