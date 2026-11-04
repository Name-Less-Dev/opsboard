import { describe, expect, it } from 'vitest';
import type { WorkOrderStatus } from './labels';
import { getAvailableActions, type AvailableActions } from './permissions';

// Mesma matriz do back (apps/api/src/work-orders/work-order.policy.spec.ts), escrita à mão:
// recalcular o esperado com a mesma lógica não provaria nada.
const ASSIGNEE_ID = 'assignee-id';
const NONE: AvailableActions = {
  editContent: false,
  editPlanning: false,
  start: false,
  complete: false,
  cancel: false,
  assign: false,
  delete: false,
};
const allow = (...actions: (keyof AvailableActions)[]): AvailableActions => ({
  ...NONE,
  ...Object.fromEntries(actions.map((action) => [action, true])),
});

type Row = [WorkOrderStatus, 'SUPERVISOR' | 'OPERATOR', boolean, AvailableActions];

const MATRIX: Row[] = [
  // Supervisor: tudo nas ativas, mesmo sem ser o responsável; nas finais, só excluir.
  [
    'OPEN',
    'SUPERVISOR',
    true,
    allow('editContent', 'editPlanning', 'start', 'cancel', 'assign', 'delete'),
  ],
  [
    'OPEN',
    'SUPERVISOR',
    false,
    allow('editContent', 'editPlanning', 'start', 'cancel', 'assign', 'delete'),
  ],
  [
    'IN_PROGRESS',
    'SUPERVISOR',
    true,
    allow('editContent', 'editPlanning', 'complete', 'cancel', 'assign', 'delete'),
  ],
  [
    'IN_PROGRESS',
    'SUPERVISOR',
    false,
    allow('editContent', 'editPlanning', 'complete', 'cancel', 'assign', 'delete'),
  ],
  ['DONE', 'SUPERVISOR', true, allow('delete')],
  ['DONE', 'SUPERVISOR', false, allow('delete')],
  ['CANCELLED', 'SUPERVISOR', true, allow('delete')],
  ['CANCELLED', 'SUPERVISOR', false, allow('delete')],

  // Operador responsável: título/descrição e avançar o fluxo; nunca cancelar, atribuir ou excluir.
  ['OPEN', 'OPERATOR', true, allow('editContent', 'start')],
  ['IN_PROGRESS', 'OPERATOR', true, allow('editContent', 'complete')],
  ['DONE', 'OPERATOR', true, NONE],
  ['CANCELLED', 'OPERATOR', true, NONE],

  // Operador que não é o responsável: nada.
  ['OPEN', 'OPERATOR', false, NONE],
  ['IN_PROGRESS', 'OPERATOR', false, NONE],
  ['DONE', 'OPERATOR', false, NONE],
  ['CANCELLED', 'OPERATOR', false, NONE],
];

describe('getAvailableActions: matriz completa', () => {
  it('cobre perfis × responsável ou não × os 4 estados (16 casos)', () => {
    expect(new Set(MATRIX.map(([s, r, a]) => `${s}|${r}|${a}`)).size).toBe(16);
  });

  it.each(MATRIX)('%s, %s, responsável=%s', (status, role, isAssignee, expected) => {
    const user = { id: isAssignee ? ASSIGNEE_ID : 'other-id', role };
    const order = { status, assignee: { id: ASSIGNEE_ID, name: 'Responsável' } };
    expect(getAvailableActions(user, order)).toEqual(expected);
  });

  it.each<[WorkOrderStatus, 'SUPERVISOR' | 'OPERATOR', AvailableActions]>([
    ['OPEN', 'OPERATOR', NONE],
    ['IN_PROGRESS', 'OPERATOR', NONE],
    [
      'OPEN',
      'SUPERVISOR',
      allow('editContent', 'editPlanning', 'start', 'cancel', 'assign', 'delete'),
    ],
  ])('ordem sem responsável: %s, %s', (status, role, expected) => {
    expect(getAvailableActions({ id: 'x', role }, { status, assignee: null })).toEqual(expected);
  });
});
