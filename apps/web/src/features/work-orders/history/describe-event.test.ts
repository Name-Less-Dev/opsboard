import { describe, expect, it } from 'vitest';
import { describeChanges, describeEvent } from './describe-event';
import type { FieldChange, WorkOrderEvent } from './history-types';

const MARIA = { id: 'u-maria', name: 'Maria' };
const JOAO = { id: 'u-joao', name: 'João' };

function event(overrides: Partial<WorkOrderEvent> & Pick<WorkOrderEvent, 'type'>): WorkOrderEvent {
  return {
    id: 'e1',
    actor: MARIA,
    fromStatus: null,
    toStatus: null,
    details: null,
    createdAt: '2026-11-05T12:00:00.000Z',
    ...overrides,
  };
}

const updated = (...changes: FieldChange[]) => event({ type: 'UPDATED', details: { changes } });
const title: FieldChange = { field: 'title', from: 'A', to: 'B' };
const priority: FieldChange = { field: 'priority', from: 'LOW', to: 'URGENT' };
const dueDate: FieldChange = {
  field: 'dueDate',
  from: '2026-11-10T02:59:59.999Z',
  to: '2026-11-13T02:59:59.999Z',
};
const description: FieldChange = { field: 'description' };

describe('describeEvent', () => {
  it.each([
    ['criação', event({ type: 'CREATED', toStatus: 'OPEN' }), 'Maria criou a ordem'],
    [
      'início',
      event({ type: 'STATUS_CHANGED', actor: JOAO, fromStatus: 'OPEN', toStatus: 'IN_PROGRESS' }),
      'João iniciou a ordem (Aberta → Em andamento)',
    ],
    [
      'conclusão',
      event({ type: 'STATUS_CHANGED', actor: JOAO, fromStatus: 'IN_PROGRESS', toStatus: 'DONE' }),
      'João concluiu a ordem',
    ],
    [
      'cancelamento de aberta',
      event({ type: 'STATUS_CHANGED', fromStatus: 'OPEN', toStatus: 'CANCELLED' }),
      'Maria cancelou a ordem',
    ],
    [
      'cancelamento em andamento',
      event({ type: 'STATUS_CHANGED', fromStatus: 'IN_PROGRESS', toStatus: 'CANCELLED' }),
      'Maria cancelou a ordem',
    ],
    [
      'atribuição com responsável anterior',
      event({
        type: 'ASSIGNED',
        details: { from: { id: 'a', name: 'Ana' }, to: { id: 'p', name: 'Pedro' } },
      }),
      'Maria atribuiu a ordem a Pedro (antes: Ana)',
    ],
    [
      'primeira atribuição',
      event({ type: 'ASSIGNED', details: { from: null, to: { id: 'p', name: 'Pedro' } } }),
      'Maria atribuiu a ordem a Pedro',
    ],
    [
      'remoção do responsável',
      event({ type: 'ASSIGNED', details: { from: { id: 'a', name: 'Ana' }, to: null } }),
      'Maria removeu o responsável (antes: Ana)',
    ],
    [
      'responsável que não existe mais',
      event({ type: 'ASSIGNED', details: { from: { id: 'x', name: null }, to: null } }),
      'Maria removeu o responsável (antes: usuário removido)',
    ],
    ['edição de um campo', updated(title), 'Maria alterou o título'],
    ['edição da descrição', updated(description), 'Maria alterou a descrição'],
    ['edição só da prioridade', updated(priority), 'Maria alterou a prioridade'],
    ['edição só do prazo', updated(dueDate), 'Maria alterou o prazo'],
    ['edição de dois campos', updated(title, priority), 'Maria alterou título e prioridade'],
    [
      'edição de três campos',
      updated(title, priority, dueDate),
      'Maria alterou título, prioridade e prazo',
    ],
    [
      'edição dos quatro campos',
      updated(title, description, priority, dueDate),
      'Maria alterou título, descrição, prioridade e prazo',
    ],
  ])('%s', (_name, input, expected) => {
    expect(describeEvent(input)).toBe(expected);
  });

  // Tipo ou formato desconhecido: texto genérico, sem quebrar.
  it.each([
    ['UPDATED com details null', event({ type: 'UPDATED', details: null })],
    ['UPDATED sem mudanças', updated()],
    ['ASSIGNED com details null', event({ type: 'ASSIGNED', details: null })],
    [
      'ASSIGNED sem antes nem depois',
      event({ type: 'ASSIGNED', details: { from: null, to: null } }),
    ],
    ['STATUS_CHANGED sem status', event({ type: 'STATUS_CHANGED' })],
    [
      'STATUS_CHANGED fora do grafo',
      event({ type: 'STATUS_CHANGED', fromStatus: 'DONE', toStatus: 'OPEN' }),
    ],
    [
      'tipo desconhecido',
      { ...event({ type: 'CREATED' }), type: 'COMMENTED' } as unknown as WorkOrderEvent,
    ],
    ['campo desconhecido na edição', updated({ field: 'color' } as unknown as FieldChange)],
  ])('%s → "Alteração registrada por Maria"', (_name, input) => {
    expect(describeEvent(input)).toBe('Alteração registrada por Maria');
  });

  it('sem ator no JSON (formato inesperado) não quebra', () => {
    const broken = { type: 'COMMENTED' } as unknown as WorkOrderEvent;
    expect(describeEvent(broken)).toBe('Alteração registrada por alguém');
  });
});

describe('describeChanges', () => {
  it('lista antes → depois dos campos com valor; a descrição não tem texto', () => {
    expect(describeChanges(updated(title, description, priority, dueDate))).toEqual([
      { label: 'Título', from: 'A', to: 'B' },
      { label: 'Prioridade', from: 'Baixa', to: 'Urgente' },
      // Mesma formatação do detalhe (fuso dos testes: São Paulo).
      { label: 'Prazo', from: '09/11/2026, 23:59', to: '12/11/2026, 23:59' },
    ]);
  });

  it('outros tipos e details null não têm linhas', () => {
    expect(describeChanges(event({ type: 'CREATED' }))).toEqual([]);
    expect(describeChanges(event({ type: 'UPDATED', details: null }))).toEqual([]);
  });
});
