import { describe, expect, it } from 'vitest';
import type { ImportRowError } from './csv-types';
import {
  columnLabel,
  describeRowError,
  groupErrorsByRow,
  hiddenErrorsNotice,
  rowErrorMessage,
  summarizeReport,
} from './import-report';

const error = (changes: Partial<ImportRowError>): ImportRowError => ({
  row: 2,
  column: 'title',
  code: 'REQUIRED',
  message: 'texto da API',
  ...changes,
});

describe('describeRowError', () => {
  it.each([
    [
      { row: 7, column: 'priority', code: 'INVALID_ENUM' },
      'Linha 7, coluna prioridade: Use Baixa, Média, Alta ou Urgente.',
    ],
    [
      { row: 3, column: 'title', code: 'REQUIRED' },
      'Linha 3, coluna título: Campo obrigatório, está vazio.',
    ],
    [
      { row: 4, column: 'title', code: 'TOO_SHORT' },
      'Linha 4, coluna título: Use pelo menos 3 caracteres.',
    ],
    [
      { row: 5, column: 'title', code: 'TOO_LONG' },
      'Linha 5, coluna título: Use no máximo 120 caracteres.',
    ],
    [
      { row: 5, column: 'description', code: 'TOO_LONG' },
      'Linha 5, coluna descrição: Use no máximo 2000 caracteres.',
    ],
    [
      { row: 8, column: 'dueDate', code: 'INVALID_DATE' },
      'Linha 8, coluna prazo: Data inválida. Use AAAA-MM-DD ou data e hora com fuso.',
    ],
    [
      { row: 9, column: 'dueDate', code: 'DATE_IN_PAST' },
      'Linha 9, coluna prazo: O prazo não pode estar no passado.',
    ],
    [
      { row: 10, column: 'assigneeEmail', code: 'UNKNOWN_ASSIGNEE' },
      'Linha 10, coluna e-mail do responsável: Nenhum usuário com este e-mail.',
    ],
    [{ row: 11, column: null, code: 'REQUIRED' }, 'Linha 11: Campo obrigatório, está vazio.'],
  ] as const)('%j', (changes, expected) => {
    expect(describeRowError(error(changes))).toBe(expected);
  });

  it('código que o front não conhece usa o texto da API', () => {
    const unknown = { ...error({}), code: 'NOVO_CODIGO' } as unknown as ImportRowError;
    expect(rowErrorMessage(unknown)).toBe('texto da API');
  });

  it('nunca usa o texto da API para um código conhecido', () => {
    expect(rowErrorMessage(error({ code: 'DATE_IN_PAST', column: 'dueDate' }))).not.toContain(
      'texto da API',
    );
  });
});

describe('columnLabel', () => {
  it.each([
    ['title', 'título'],
    ['assigneeEmail', 'e-mail do responsável'],
    [null, 'linha inteira'],
  ] as const)('%s → %s', (column, label) => {
    expect(columnLabel(column)).toBe(label);
  });
});

describe('groupErrorsByRow', () => {
  it('agrupa por linha mantendo a ordem', () => {
    const errors = [
      error({ row: 3, column: 'title' }),
      error({ row: 3, column: 'priority' }),
      error({ row: 7, column: 'dueDate' }),
    ];
    expect(groupErrorsByRow(errors)).toEqual([
      { row: 3, errors: [errors[0], errors[1]] },
      { row: 7, errors: [errors[2]] },
    ]);
  });

  it('sem erros, sem grupos', () => {
    expect(groupErrorsByRow([])).toEqual([]);
  });
});

describe('summarizeReport', () => {
  it.each([
    [{ totalRows: 120, validRows: 118 }, '120 linhas, 118 válidas, 2 com erro'],
    [{ totalRows: 1, validRows: 1 }, '1 linha, 1 válida, 0 com erro'],
    [{ totalRows: 2, validRows: 0 }, '2 linhas, 0 válidas, 2 com erro'],
    [{ totalRows: 1500, validRows: 1499 }, '1.500 linhas, 1.499 válidas, 1 com erro'],
  ])('%j → %s', (report, expected) => {
    expect(summarizeReport(report)).toBe(expected);
  });
});

describe('hiddenErrorsNotice', () => {
  it('avisa quando há mais erros do que os mostrados', () => {
    const errors = Array.from({ length: 100 }, () => error({}));
    expect(hiddenErrorsNotice({ totalErrors: 150, errors })).toBe(
      'Mostrando os primeiros 100 de 150 erros. Corrija estes e valide de novo para ver os demais.',
    );
  });

  it('sem erros escondidos, sem aviso', () => {
    expect(hiddenErrorsNotice({ totalErrors: 2, errors: [error({}), error({})] })).toBeNull();
    expect(hiddenErrorsNotice({ totalErrors: 0, errors: [] })).toBeNull();
  });
});
