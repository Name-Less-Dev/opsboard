import { describe, expect, it } from 'vitest';
import { formatDateTime } from './format';

describe('formatDateTime', () => {
  // Testes rodam em America/Sao_Paulo (UTC-3).
  it.each([
    ['2026-11-04T17:00:00.000Z', '04/11/2026, 14:00'],
    ['2026-11-05T02:59:00.000Z', '04/11/2026, 23:59'],
    ['2026-11-05T03:00:00.000Z', '05/11/2026, 00:00'],
  ])('%s → %s (fuso local)', (iso, expected) => {
    expect(formatDateTime(iso)).toBe(expected);
  });
});
