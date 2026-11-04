import { describe, expect, it } from 'vitest';
import { createWorkOrderSchema, editWorkOrderSchema } from './work-order-schema';

const TODAY = '2026-11-04';
const VALID = { title: 'Trocar filtro', description: '', priority: 'MEDIUM', dueDate: TODAY };

const errorsOf = (result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) =>
  Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message]),
  );

describe('schema do formulário de ordem', () => {
  const create = createWorkOrderSchema(TODAY);

  it('aceita o mínimo válido, com prazo hoje', () => {
    expect(create.safeParse(VALID).success).toBe(true);
  });

  it.each<[string, object, Record<string, string>]>([
    ['título curto', { title: 'ab' }, { title: 'O título precisa ter pelo menos 3 caracteres.' }],
    [
      'título só com espaços',
      { title: '     ' },
      { title: 'O título precisa ter pelo menos 3 caracteres.' },
    ],
    [
      'título longo',
      { title: 'a'.repeat(121) },
      { title: 'O título pode ter no máximo 120 caracteres.' },
    ],
    [
      'descrição longa',
      { description: 'a'.repeat(2001) },
      { description: 'A descrição pode ter no máximo 2000 caracteres.' },
    ],
    ['prioridade fora do enum', { priority: 'CRITICAL' }, { priority: 'Escolha a prioridade.' }],
    ['prioridade vazia', { priority: '' }, { priority: 'Escolha a prioridade.' }],
    ['sem prazo', { dueDate: '' }, { dueDate: 'Informe o prazo.' }],
    [
      'prazo no passado',
      { dueDate: '2026-11-03' },
      { dueDate: 'O prazo não pode ser anterior a hoje.' },
    ],
  ])('criação recusa %s', (_name, changes, expected) => {
    expect(errorsOf(create.safeParse({ ...VALID, ...changes }))).toEqual(expected);
  });

  it.each([
    ['título com 3 caracteres', { title: 'abc' }],
    ['título com 120 caracteres', { title: 'a'.repeat(120) }],
    ['descrição com 2000 caracteres', { description: 'a'.repeat(2000) }],
  ])('aceita o limite: %s', (_name, changes) => {
    expect(create.safeParse({ ...VALID, ...changes }).success).toBe(true);
  });

  it('edição aceita prazo no passado (a API só proíbe na criação)', () => {
    expect(editWorkOrderSchema.safeParse({ ...VALID, dueDate: '2020-01-01' }).success).toBe(true);
  });

  it('edição continua validando título e prazo vazio', () => {
    expect(errorsOf(editWorkOrderSchema.safeParse({ ...VALID, title: 'a', dueDate: '' }))).toEqual({
      title: 'O título precisa ter pelo menos 3 caracteres.',
      dueDate: 'Informe o prazo.',
    });
  });
});
