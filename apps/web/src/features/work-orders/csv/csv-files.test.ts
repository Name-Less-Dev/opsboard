import { describe, expect, it } from 'vitest';
import { DEFAULT_LIST_PARAMS, toApiQuery, type ListParams } from '../list-params';
import {
  buildExportQuery,
  buildTemplateCsv,
  exportHint,
  FALLBACK_EXPORT_FILENAME,
  filenameFromContentDisposition,
  MAX_IMPORT_BYTES,
  validateCsvFile,
} from './csv-files';

const params = (changes: Partial<ListParams>): ListParams => ({
  ...DEFAULT_LIST_PARAMS,
  ...changes,
});

describe('buildExportQuery', () => {
  it('é a query da lista sem page e pageSize', () => {
    const list = params({
      q: 'filtro',
      status: ['OPEN', 'IN_PROGRESS'],
      priority: ['URGENT'],
      mine: true,
      overdue: true,
      dueFrom: '2026-11-01',
      dueTo: '2026-11-30',
      sortBy: 'dueDate',
      order: 'asc',
      page: 4,
      pageSize: 50,
    });
    const expected = toApiQuery(list);
    expected.delete('page');
    expected.delete('pageSize');

    const query = buildExportQuery(list);
    expect(query.toString()).toBe(expected.toString());
    expect(query.has('page')).toBe(false);
    expect(query.has('pageSize')).toBe(false);
    expect(Object.fromEntries(query)).toMatchObject({
      q: 'filtro',
      status: 'OPEN,IN_PROGRESS',
      priority: 'URGENT',
      assigneeId: 'me',
      overdue: 'true',
      sortBy: 'dueDate',
      order: 'asc',
    });
  });

  it('sem filtros, só a ordenação padrão', () => {
    expect(Object.fromEntries(buildExportQuery(DEFAULT_LIST_PARAMS))).toEqual({
      sortBy: 'createdAt',
      order: 'desc',
    });
  });
});

describe('filenameFromContentDisposition', () => {
  it.each([
    [
      'attachment; filename="opsboard-ordens-20261105-1430.csv"',
      'opsboard-ordens-20261105-1430.csv',
    ],
    ['attachment; filename=ordens.csv', 'ordens.csv'],
    ['attachment;filename="a b.csv"; size=10', 'a b.csv'],
    ["attachment; filename*=UTF-8''ordens%20de%20servi%C3%A7o.csv", 'ordens de serviço.csv'],
    ['attachment; filename="../../etc/passwd"', 'passwd'],
  ])('%j → %j', (header, expected) => {
    expect(filenameFromContentDisposition(header)).toBe(expected);
  });

  it.each([[null], [''], ['attachment'], ['attachment; filename=""']])(
    'sem nome (%j) usa o padrão',
    (header) => {
      expect(filenameFromContentDisposition(header)).toBe(FALLBACK_EXPORT_FILENAME);
    },
  );
});

describe('buildTemplateCsv', () => {
  const csv = buildTemplateCsv(new Date(2026, 10, 5, 12));

  it('tem BOM, cabeçalho com `;` e CRLF', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')[0]).toBe('title;description;priority;dueDate;assigneeEmail');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('tem uma linha de exemplo com prazo 30 dias à frente e sem responsável', () => {
    const lines = csv.slice(1).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[1].split(';')).toEqual([
      'Trocar filtro do ar-condicionado',
      'Sala 2, filtro G4',
      'Alta',
      '2026-12-05',
      '',
    ]);
  });
});

describe('validateCsvFile', () => {
  it.each([
    [{ name: 'ordens.csv', size: 10 }],
    [{ name: 'ORDENS.CSV', size: 10 }],
    [{ name: 'ordens.csv', size: MAX_IMPORT_BYTES }],
  ])('aceita %j', (file) => {
    expect(validateCsvFile(file)).toBeNull();
  });

  it.each([
    [{ name: 'ordens.xlsx', size: 10 }, /\.csv/],
    [{ name: 'ordens.csv.txt', size: 10 }, /\.csv/],
    [{ name: 'csv', size: 10 }, /\.csv/],
    [{ name: 'ordens.csv', size: 0 }, /vazio/],
    [{ name: 'ordens.csv', size: MAX_IMPORT_BYTES + 1 }, /1 MB/],
  ])('recusa %j', (file, message) => {
    expect(validateCsvFile(file)).toMatch(message);
  });
});

describe('exportHint', () => {
  it.each([
    [null, 'Exporta os resultados filtrados'],
    [0, 'Nenhum resultado para exportar'],
    [1, 'Exporta 1 resultado filtrado'],
    [1234, 'Exporta os 1.234 resultados filtrados'],
  ])('%j → %s', (total, expected) => {
    expect(exportHint(total)).toBe(expected);
  });
});
