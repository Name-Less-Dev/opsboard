import { describe, expect, it } from 'vitest';
import { buildUpdatePayload, type WorkOrderFormValues } from './update-payload';

const ORIGINAL: WorkOrderFormValues = {
  title: 'Trocar filtro',
  description: 'Filtro do ar da sala 2',
  priority: 'MEDIUM',
  dueDate: '2026-11-10',
};

const form = (changes: Partial<WorkOrderFormValues>) => ({ ...ORIGINAL, ...changes });

describe('buildUpdatePayload', () => {
  it.each<[string, Partial<WorkOrderFormValues>]>([
    ['nada mudou', {}],
    ['só espaços nas pontas do título', { title: '  Trocar filtro  ' }],
    ['só espaços nas pontas da descrição', { description: ' Filtro do ar da sala 2 ' }],
  ])('devolve null quando %s', (_name, changes) => {
    expect(buildUpdatePayload(ORIGINAL, form(changes))).toBeNull();
  });

  it.each<[string, Partial<WorkOrderFormValues>, object]>([
    ['título', { title: 'Trocar filtro e limpar' }, { title: 'Trocar filtro e limpar' }],
    ['título com espaços é aparado', { title: '  Novo  ' }, { title: 'Novo' }],
    ['descrição', { description: 'Outra' }, { description: 'Outra' }],
    ['descrição apagada vira null (limpa na API)', { description: '   ' }, { description: null }],
    ['prioridade', { priority: 'URGENT' }, { priority: 'URGENT' }],
    // Testes em America/Sao_Paulo: fim do dia 12 local = 13 02:59:59.999 UTC.
    [
      'prazo vira o fim do dia local',
      { dueDate: '2026-11-12' },
      { dueDate: '2026-11-13T02:59:59.999Z' },
    ],
    [
      'vários campos, só os alterados',
      { title: 'Novo título', priority: 'LOW' },
      { title: 'Novo título', priority: 'LOW' },
    ],
  ])('envia só o que mudou: %s', (_name, changes, expected) => {
    expect(buildUpdatePayload(ORIGINAL, form(changes))).toEqual(expected);
  });

  it('descrição original vazia e campo vazio: não muda', () => {
    const original = { ...ORIGINAL, description: '' };
    expect(buildUpdatePayload(original, { ...original, description: '  ' })).toBeNull();
  });

  it('descrição original vazia e campo preenchido: envia o texto', () => {
    const original = { ...ORIGINAL, description: '' };
    expect(buildUpdatePayload(original, { ...original, description: 'Nova' })).toEqual({
      description: 'Nova',
    });
  });
});
