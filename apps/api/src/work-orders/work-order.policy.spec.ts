import type { Role, WorkOrderStatus } from '../generated/prisma/enums';
import {
  type Actor,
  canAssign,
  canCreate,
  canEditFields,
  canTransition,
  type EditableField,
} from './work-order.policy';

const ASSIGNEE_ID = 'assignee-id';

const actorFor = (role: Role, isAssignee: boolean): Actor => ({
  id: isAssignee ? ASSIGNEE_ID : 'other-id',
  role,
});

const ALLOWED = { allowed: true };
const INVALID = { allowed: false, reason: 'INVALID_TRANSITION' };
const FORBIDDEN = { allowed: false, reason: 'FORBIDDEN' };
const FINAL = { allowed: false, reason: 'ORDER_FINAL' };

const STATUSES: WorkOrderStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

describe('canTransition: matriz completa', () => {
  // Tabela escrita à mão de propósito: recalcular o esperado com a mesma lógica não provaria nada.
  // Colunas: supervisor responsável | supervisor não responsável | operador responsável | operador não responsável
  const MATRIX: [WorkOrderStatus, WorkOrderStatus, object, object, object, object][] = [
    ['OPEN', 'OPEN', INVALID, INVALID, INVALID, INVALID],
    ['OPEN', 'IN_PROGRESS', ALLOWED, ALLOWED, ALLOWED, FORBIDDEN],
    ['OPEN', 'DONE', INVALID, INVALID, INVALID, INVALID],
    ['OPEN', 'CANCELLED', ALLOWED, ALLOWED, FORBIDDEN, FORBIDDEN],

    ['IN_PROGRESS', 'OPEN', INVALID, INVALID, INVALID, INVALID],
    ['IN_PROGRESS', 'IN_PROGRESS', INVALID, INVALID, INVALID, INVALID],
    ['IN_PROGRESS', 'DONE', ALLOWED, ALLOWED, ALLOWED, FORBIDDEN],
    ['IN_PROGRESS', 'CANCELLED', ALLOWED, ALLOWED, FORBIDDEN, FORBIDDEN],

    ['DONE', 'OPEN', INVALID, INVALID, INVALID, INVALID],
    ['DONE', 'IN_PROGRESS', INVALID, INVALID, INVALID, INVALID],
    ['DONE', 'DONE', INVALID, INVALID, INVALID, INVALID],
    ['DONE', 'CANCELLED', INVALID, INVALID, INVALID, INVALID],

    ['CANCELLED', 'OPEN', INVALID, INVALID, INVALID, INVALID],
    ['CANCELLED', 'IN_PROGRESS', INVALID, INVALID, INVALID, INVALID],
    ['CANCELLED', 'DONE', INVALID, INVALID, INVALID, INVALID],
    ['CANCELLED', 'CANCELLED', INVALID, INVALID, INVALID, INVALID],
  ];

  const cases = MATRIX.flatMap(([from, to, supAssignee, supOther, opAssignee, opOther]) => [
    { from, to, role: 'SUPERVISOR' as const, isAssignee: true, expected: supAssignee },
    { from, to, role: 'SUPERVISOR' as const, isAssignee: false, expected: supOther },
    { from, to, role: 'OPERATOR' as const, isAssignee: true, expected: opAssignee },
    { from, to, role: 'OPERATOR' as const, isAssignee: false, expected: opOther },
  ]);

  it('cobre todas as 64 combinações', () => {
    expect(cases).toHaveLength(64);
    expect(new Set(cases.map((c) => `${c.from}|${c.to}|${c.role}|${c.isAssignee}`)).size).toBe(64);
  });

  it.each(cases)(
    '$from → $to, $role, responsável=$isAssignee',
    ({ from, to, role, isAssignee, expected }) => {
      const order = { status: from, assigneeId: ASSIGNEE_ID };
      expect(canTransition(actorFor(role, isAssignee), order, to)).toEqual(expected);
    },
  );

  it.each([
    ['OPEN', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'DONE'],
  ] as const)('ordem sem responsável: %s → %s só por supervisor', (from, to) => {
    const order = { status: from, assigneeId: null };
    expect(canTransition(actorFor('OPERATOR', false), order, to)).toEqual(FORBIDDEN);
    expect(canTransition(actorFor('SUPERVISOR', false), order, to)).toEqual(ALLOWED);
  });
});

describe('canEditFields', () => {
  const TEXT: EditableField[] = ['title', 'description'];
  const CONTROL: EditableField[] = ['priority', 'dueDate'];
  const MIXED: EditableField[] = ['title', 'priority'];

  // Colunas: supervisor | operador responsável | operador não responsável
  const ACTIVE: [string, EditableField[], object, object, object][] = [
    ['título e descrição', TEXT, ALLOWED, ALLOWED, FORBIDDEN],
    ['só título', ['title'], ALLOWED, ALLOWED, FORBIDDEN],
    ['só descrição', ['description'], ALLOWED, ALLOWED, FORBIDDEN],
    ['prioridade e prazo', CONTROL, ALLOWED, FORBIDDEN, FORBIDDEN],
    ['só prioridade', ['priority'], ALLOWED, FORBIDDEN, FORBIDDEN],
    ['só prazo', ['dueDate'], ALLOWED, FORBIDDEN, FORBIDDEN],
    ['campos misturados (sem aplicação parcial)', MIXED, ALLOWED, FORBIDDEN, FORBIDDEN],
  ];

  describe.each(['OPEN', 'IN_PROGRESS'] as const)('ordem %s', (status) => {
    it.each(ACTIVE)('%s', (_name, fields, supervisor, opAssignee, opOther) => {
      const order = { status, assigneeId: ASSIGNEE_ID };
      expect(canEditFields(actorFor('SUPERVISOR', false), order, fields)).toEqual(supervisor);
      expect(canEditFields(actorFor('OPERATOR', true), order, fields)).toEqual(opAssignee);
      expect(canEditFields(actorFor('OPERATOR', false), order, fields)).toEqual(opOther);
    });
  });

  describe.each(['DONE', 'CANCELLED'] as const)('ordem %s é final para todos', (status) => {
    it.each([
      ['supervisor', 'SUPERVISOR', false],
      ['operador responsável', 'OPERATOR', true],
      ['operador não responsável', 'OPERATOR', false],
    ] as const)('%s', (_name, role, isAssignee) => {
      const order = { status, assigneeId: ASSIGNEE_ID };
      expect(canEditFields(actorFor(role, isAssignee), order, MIXED)).toEqual(FINAL);
    });
  });

  it('ordem sem responsável: operador não edita', () => {
    const order = { status: 'OPEN' as const, assigneeId: null };
    expect(canEditFields(actorFor('OPERATOR', false), order, ['title'])).toEqual(FORBIDDEN);
  });
});

describe('canAssign', () => {
  // Colunas: supervisor | operador responsável | operador não responsável
  const MATRIX: [WorkOrderStatus, object, object, object][] = [
    ['OPEN', ALLOWED, FORBIDDEN, FORBIDDEN],
    ['IN_PROGRESS', ALLOWED, FORBIDDEN, FORBIDDEN],
    ['DONE', FINAL, FINAL, FINAL],
    ['CANCELLED', FINAL, FINAL, FINAL],
  ];

  it('a tabela cobre todos os estados', () => {
    expect(MATRIX.map(([status]) => status)).toEqual(STATUSES);
  });

  it.each(MATRIX)('ordem %s', (status, supervisor, opAssignee, opOther) => {
    const order = { status, assigneeId: ASSIGNEE_ID };
    expect(canAssign(actorFor('SUPERVISOR', false), order)).toEqual(supervisor);
    expect(canAssign(actorFor('OPERATOR', true), order)).toEqual(opAssignee);
    expect(canAssign(actorFor('OPERATOR', false), order)).toEqual(opOther);
  });
});

describe('canCreate', () => {
  const operator: Actor = { id: 'operator-id', role: 'OPERATOR' };
  const supervisor: Actor = { id: 'supervisor-id', role: 'SUPERVISOR' };

  it.each([
    ['sem responsável', undefined, ALLOWED],
    ['responsável nulo', null, ALLOWED],
    ['ele mesmo', 'operator-id', ALLOWED],
    ['outro usuário', 'other-id', FORBIDDEN],
  ])('operador: %s', (_name, assigneeId, expected) => {
    expect(canCreate(operator, assigneeId)).toEqual(expected);
  });

  it.each([
    ['sem responsável', undefined],
    ['responsável nulo', null],
    ['ele mesmo', 'supervisor-id'],
    ['outro usuário', 'other-id'],
  ])('supervisor: %s', (_name, assigneeId) => {
    expect(canCreate(supervisor, assigneeId)).toEqual(ALLOWED);
  });
});
