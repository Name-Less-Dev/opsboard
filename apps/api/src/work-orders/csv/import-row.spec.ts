import type { ImportRecord } from './import-file';
import {
  buildReport,
  MAX_REPORTED_ERRORS,
  parseDueDate,
  parsePriority,
  validateRow,
  type RowContext,
  type RowError,
} from './import-row';

const TZ = 'America/Sao_Paulo';
// 05/11/2026 12:00 em São Paulo (UTC-3, sem horário de verão).
const NOW = new Date('2026-11-05T15:00:00.000Z');

describe('parsePriority', () => {
  it.each([
    ['LOW', 'LOW'],
    ['medium', 'MEDIUM'],
    ['High', 'HIGH'],
    ['URGENT', 'URGENT'],
    ['Baixa', 'LOW'],
    ['Média', 'MEDIUM'],
    ['Media', 'MEDIUM'],
    ['MÉDIA', 'MEDIUM'],
    ['alta', 'HIGH'],
    ['  Urgente  ', 'URGENT'],
  ])('%j → %s', (input, expected) => {
    expect(parsePriority(input)).toEqual({ ok: true, value: expected });
  });

  it.each([[''], ['   '], [undefined]])('vazio (%j) é REQUIRED', (input) => {
    expect(parsePriority(input)).toEqual({ ok: false, code: 'REQUIRED' });
  });

  it.each([['Crítica'], ['1'], ['HIGHEST'], ['Alt']])('%j é INVALID_ENUM', (input) => {
    expect(parsePriority(input)).toEqual({ ok: false, code: 'INVALID_ENUM' });
  });
});

describe('parseDueDate', () => {
  const parse = (value: string | undefined, now = NOW) => parseDueDate(value, now, TZ);

  it('somente data vale o fim do dia no fuso configurado', () => {
    expect(parse('2026-12-10')).toEqual({
      ok: true,
      value: new Date('2026-12-11T02:59:59.999Z'),
    });
  });

  it('o fim do dia depende do fuso', () => {
    expect(parseDueDate('2026-12-10', NOW, 'UTC')).toEqual({
      ok: true,
      value: new Date('2026-12-10T23:59:59.999Z'),
    });
  });

  it('hoje (só a data) ainda é válido: vale o fim do dia', () => {
    expect(parse('2026-11-05')).toEqual({ ok: true, value: new Date('2026-11-06T02:59:59.999Z') });
  });

  it.each([
    ['2026-12-01T18:00:00Z', '2026-12-01T18:00:00.000Z'],
    ['2026-12-01T18:00:00.250Z', '2026-12-01T18:00:00.250Z'],
    ['2026-12-01T18:00-03:00', '2026-12-01T21:00:00.000Z'],
    ['2026-12-01T18:00:00+05:30', '2026-12-01T12:30:00.000Z'],
    ['  2026-12-01T18:00:00Z ', '2026-12-01T18:00:00.000Z'],
  ])('ISO completo %j', (input, expected) => {
    expect(parse(input)).toEqual({ ok: true, value: new Date(expected) });
  });

  it.each([[''], ['  '], [undefined]])('vazio (%j) é REQUIRED', (input) => {
    expect(parse(input)).toEqual({ ok: false, code: 'REQUIRED' });
  });

  it.each([
    ['10/12/2026'],
    ['2026-12-01T18:00:00'],
    ['2026-12-1'],
    ['amanhã'],
    ['2026-12-01 18:00Z'],
    ['20261201'],
  ])('formato inválido %j é INVALID_DATE', (input) => {
    expect(parse(input)).toEqual({ ok: false, code: 'INVALID_DATE' });
  });

  it.each([['2027-02-31'], ['2027-13-01'], ['2027-02-29'], ['2026-12-01T25:00:00Z']])(
    'data inexistente %j é INVALID_DATE',
    (input) => {
      expect(parse(input)).toEqual({ ok: false, code: 'INVALID_DATE' });
    },
  );

  it.each([['2026-11-04'], ['2026-11-05T14:59:59.999Z'], ['2020-01-01T00:00:00Z']])(
    'passado %j é DATE_IN_PAST',
    (input) => {
      expect(parse(input)).toEqual({ ok: false, code: 'DATE_IN_PAST' });
    },
  );

  it('exatamente "agora" é aceito', () => {
    expect(parse(NOW.toISOString())).toEqual({ ok: true, value: NOW });
  });
});

describe('validateRow', () => {
  const ANA_ID = '11111111-1111-4111-8111-111111111111';
  const context: RowContext = {
    now: NOW,
    timezone: TZ,
    usersByEmail: new Map([['ana@opsboard.dev', ANA_ID]]),
  };
  const record = (values: ImportRecord['values'], rowNumber = 2): ImportRecord => ({
    rowNumber,
    values,
  });

  it('linha válida vira os dados da criação', () => {
    const result = validateRow(
      record({
        title: '  Trocar filtro ',
        description: ' Sala 3 ',
        priority: 'Alta',
        dueDate: '2026-12-10',
        assigneeEmail: ' ANA@opsboard.dev ',
      }),
      context,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        title: 'Trocar filtro',
        description: 'Sala 3',
        priority: 'HIGH',
        dueDate: new Date('2026-12-11T02:59:59.999Z'),
        assigneeId: ANA_ID,
      },
    });
  });

  it('colunas opcionais ausentes ou vazias: sem descrição e sem responsável', () => {
    const result = validateRow(
      record({ title: 'Abc', priority: 'LOW', dueDate: '2026-12-10', description: '  ' }),
      context,
    );
    expect(result.ok && result.value).toMatchObject({ description: null, assigneeId: null });
  });

  it.each([
    ['', 'REQUIRED'],
    ['ab', 'TOO_SHORT'],
    ['  ab  ', 'TOO_SHORT'],
    ['x'.repeat(121), 'TOO_LONG'],
  ])('título %j → %s', (title, code) => {
    const result = validateRow(record({ title, priority: 'LOW', dueDate: '2026-12-10' }), context);
    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ row: 2, column: 'title', code })],
    });
  });

  it('título com 120 e descrição com 2000 caracteres passam; 2001 não', () => {
    const base = { title: 'x'.repeat(120), priority: 'LOW', dueDate: '2026-12-10' };
    expect(validateRow(record({ ...base, description: 'd'.repeat(2000) }), context).ok).toBe(true);
    expect(validateRow(record({ ...base, description: 'd'.repeat(2001) }), context)).toEqual({
      ok: false,
      errors: [expect.objectContaining({ column: 'description', code: 'TOO_LONG' })],
    });
  });

  it('e-mail desconhecido é UNKNOWN_ASSIGNEE', () => {
    const result = validateRow(
      record({ title: 'Abc', priority: 'LOW', dueDate: '2026-12-10', assigneeEmail: 'x@y.z' }),
      context,
    );
    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ column: 'assigneeEmail', code: 'UNKNOWN_ASSIGNEE' })],
    });
  });

  it('devolve todas as falhas da mesma linha, na ordem das colunas, com mensagem', () => {
    const result = validateRow(
      record({ title: 'a', priority: 'x', dueDate: '2020-01-01', assigneeEmail: 'nao@existe' }, 7),
      context,
    );
    expect(result.ok).toBe(false);
    const errors = result.ok ? [] : result.errors;
    expect(errors.map(({ row, column, code }) => [row, column, code])).toEqual([
      [7, 'title', 'TOO_SHORT'],
      [7, 'priority', 'INVALID_ENUM'],
      [7, 'dueDate', 'DATE_IN_PAST'],
      [7, 'assigneeEmail', 'UNKNOWN_ASSIGNEE'],
    ]);
    for (const error of errors) expect(error.message).toMatch(/\S/);
  });

  it('linha sem nada nas colunas obrigatórias acusa título, prioridade e prazo', () => {
    const result = validateRow(record({ description: 'só descrição' }), context);
    const codes = result.ok ? [] : result.errors.map((error) => `${error.column}:${error.code}`);
    expect(codes).toEqual(['title:REQUIRED', 'priority:REQUIRED', 'dueDate:REQUIRED']);
  });
});

describe('buildReport', () => {
  const error = (row: number, column: RowError['column'] = 'title'): RowError => ({
    row,
    column,
    code: 'REQUIRED',
    message: 'm',
  });

  it('sem erros: válido', () => {
    expect(buildReport(3, [])).toEqual({
      valid: true,
      totalRows: 3,
      validRows: 3,
      totalErrors: 0,
      errors: [],
    });
  });

  it('conta linhas com erro, não erros, para as linhas válidas', () => {
    const report = buildReport(10, [error(2, 'title'), error(2, 'priority'), error(5)]);
    expect(report).toMatchObject({ valid: false, totalRows: 10, validRows: 8, totalErrors: 3 });
  });

  it('ordena por linha e depois pela ordem das colunas', () => {
    const report = buildReport(10, [
      error(5, 'dueDate'),
      error(2, 'assigneeEmail'),
      error(2, 'title'),
      error(2, null),
    ]);
    expect(report.errors.map((item) => [item.row, item.column])).toEqual([
      [2, null],
      [2, 'title'],
      [2, 'assigneeEmail'],
      [5, 'dueDate'],
    ]);
  });

  it(`corta em ${MAX_REPORTED_ERRORS} erros, mantendo o total real`, () => {
    const errors = Array.from({ length: 150 }, (_, index) => error(index + 2));
    const report = buildReport(150, errors);
    expect(report.errors).toHaveLength(100);
    expect(report.totalErrors).toBe(150);
    expect(report.validRows).toBe(0);
    expect(report.errors[99].row).toBe(101);
  });
});
