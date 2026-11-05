import { parse } from 'csv-parse/sync';
import type { WorkOrderResponse } from '../work-order-select';
import { buildExportCsv, EXPORT_COLUMNS, exportFilename, toExportRow } from './export-csv';

const BOM = String.fromCharCode(0xfeff);

const order = (overrides: Partial<WorkOrderResponse> = {}): WorkOrderResponse => ({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Trocar filtro',
  description: null,
  priority: 'MEDIUM',
  status: 'IN_PROGRESS',
  dueDate: new Date('2026-12-01T21:00:00.000Z'),
  assignee: null,
  createdBy: { id: 'c', name: 'Carla Supervisora' },
  createdAt: new Date('2026-11-01T10:00:00.000Z'),
  updatedAt: new Date('2026-11-02T10:00:00.000Z'),
  ...overrides,
});

describe('toExportRow', () => {
  it('usa rótulos em português, ISO em UTC e célula vazia sem responsável', () => {
    expect(toExportRow(order())).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'Trocar filtro',
      '',
      'Média',
      'Em andamento',
      '2026-12-01T21:00:00.000Z',
      '',
      'Carla Supervisora',
      '2026-11-01T10:00:00.000Z',
      '2026-11-02T10:00:00.000Z',
    ]);
  });

  it('neutraliza título, descrição e nomes', () => {
    const row = toExportRow(
      order({
        title: '=HYPERLINK("x")',
        description: '+cmd',
        assignee: { id: 'a', name: '@Ana' },
        createdBy: { id: 'c', name: '-Carla' },
      }),
    );
    expect([row[1], row[2], row[6], row[7]]).toEqual([
      `'=HYPERLINK("x")`,
      "'+cmd",
      "'@Ana",
      "'-Carla",
    ]);
  });
});

describe('buildExportCsv', () => {
  it('começa com BOM e cabeçalho, separado por ; e com CRLF', () => {
    const csv = buildExportCsv([order()]);
    expect(csv.startsWith(`${BOM}${EXPORT_COLUMNS.join(';')}\r\n`)).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('escapa separador, aspas, vírgula e quebra de linha (lido de volta igual)', () => {
    const tricky = order({ title: 'A; "B", C', description: 'linha 1\nlinha 2\r\nlinha 3' });
    const rows: string[][] = parse(buildExportCsv([tricky]), { bom: true, delimiter: ';' });
    const row = rows[1];
    expect(row[1]).toBe('A; "B", C');
    expect(row[2]).toBe('linha 1\nlinha 2\r\nlinha 3');
  });

  it('sem ordens, só o cabeçalho', () => {
    expect(buildExportCsv([])).toBe(`${BOM}${EXPORT_COLUMNS.join(';')}\r\n`);
  });
});

describe('exportFilename', () => {
  it.each([
    ['2026-11-05T17:30:00Z', 'America/Sao_Paulo', 'opsboard-ordens-20261105-1430.csv'],
    ['2026-11-06T01:05:00Z', 'America/Sao_Paulo', 'opsboard-ordens-20261105-2205.csv'],
    ['2026-11-06T01:05:00Z', 'UTC', 'opsboard-ordens-20261106-0105.csv'],
  ])('%s em %s → %s', (now, timezone, expected) => {
    expect(exportFilename(new Date(now), timezone)).toBe(expected);
  });
});
