import { describe, expect, it } from 'vitest';
import { summarizeStatus, type StatusCounts } from './summary';

const counts = (OPEN: number, IN_PROGRESS: number, DONE: number, CANCELLED: number) =>
  ({ OPEN, IN_PROGRESS, DONE, CANCELLED }) satisfies StatusCounts;

const sum = (shares: Record<string, number>) => Object.values(shares).reduce((a, b) => a + b, 0);

describe('summarizeStatus', () => {
  it('total soma os 4 status; ativas = abertas + em andamento', () => {
    const result = summarizeStatus(counts(5, 2, 2, 1));
    expect(result.total).toBe(10);
    expect(result.active).toBe(7);
    expect(result.percent).toEqual({ OPEN: 50, IN_PROGRESS: 20, DONE: 20, CANCELLED: 10 });
  });

  it('total 0: percentuais 0, sem divisão por zero (nada de NaN)', () => {
    const result = summarizeStatus(counts(0, 0, 0, 0));
    expect(result).toEqual({
      total: 0,
      active: 0,
      percent: { OPEN: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 },
    });
  });

  it.each([
    // 33,3 + 33,3 + 33,3: arredondar cada um daria 99; o resto vai para um deles.
    [counts(1, 1, 1, 0), { OPEN: 34, IN_PROGRESS: 33, DONE: 33, CANCELLED: 0 }],
    // 16,7 × 6: arredondar cada um daria 17 × 6 = 102.
    [counts(1, 1, 2, 2), { OPEN: 17, IN_PROGRESS: 17, DONE: 33, CANCELLED: 33 }],
    // Um status com 1 em 1000 (0,1%) fica com 0, sem passar de 100 no total.
    [counts(1, 333, 333, 333), { OPEN: 0, IN_PROGRESS: 34, DONE: 33, CANCELLED: 33 }],
    [counts(0, 0, 7, 0), { OPEN: 0, IN_PROGRESS: 0, DONE: 100, CANCELLED: 0 }],
  ])('percentuais inteiros que somam exatamente 100 (%o)', (input, expected) => {
    const { percent } = summarizeStatus(input);
    expect(percent).toEqual(expected);
    expect(sum(percent)).toBe(100);
  });

  it('soma 100 em muitas combinações', () => {
    for (let a = 0; a <= 7; a++)
      for (let b = 0; b <= 7; b++)
        for (let c = 0; c <= 7; c++) {
          const { total, percent } = summarizeStatus(counts(a, b, c, 3));
          expect(sum(percent)).toBe(total === 0 ? 0 : 100);
        }
  });
});
