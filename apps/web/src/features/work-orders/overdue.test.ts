import { describe, expect, it } from 'vitest';
import type { WorkOrderStatus } from './labels';
import { isOverdue } from './overdue';

// Mesmos casos de borda do back (work-order-query.spec.ts e e2e da listagem).
const NOW = new Date('2026-11-03T12:00:00.000Z');
const BEFORE = '2026-11-03T11:59:59.999Z';
const EQUAL = '2026-11-03T12:00:00.000Z';
const AFTER = '2026-11-03T12:00:00.001Z';

describe('isOverdue', () => {
  it.each<[WorkOrderStatus, string, boolean]>([
    ['OPEN', BEFORE, true],
    ['IN_PROGRESS', BEFORE, true],
    ['DONE', BEFORE, false],
    ['CANCELLED', BEFORE, false],
    ['OPEN', EQUAL, false],
    ['IN_PROGRESS', EQUAL, false],
    ['OPEN', AFTER, false],
    ['IN_PROGRESS', AFTER, false],
    ['DONE', AFTER, false],
  ])('%s com prazo %s → %s', (status, dueDate, expected) => {
    expect(isOverdue({ status, dueDate }, NOW)).toBe(expected);
  });

  it('compara instantes, não o texto: o mesmo instante em outro fuso não é atrasado', () => {
    expect(isOverdue({ status: 'OPEN', dueDate: '2026-11-03T09:00:00.000-03:00' }, NOW)).toBe(
      false,
    );
    expect(isOverdue({ status: 'OPEN', dueDate: '2026-11-03T08:59:59.999-03:00' }, NOW)).toBe(true);
  });

  it('usa o instante recebido, não o relógio da máquina', () => {
    const past = new Date('2000-01-01T00:00:00.000Z');
    expect(isOverdue({ status: 'OPEN', dueDate: BEFORE }, past)).toBe(false);
  });
});
