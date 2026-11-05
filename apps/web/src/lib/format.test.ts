import { describe, expect, it } from 'vitest';
import { formatDateTime, formatTime } from './format';

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

describe('formatTime', () => {
  it.each([
    ['2026-11-04T17:05:00.000Z', '14:05'],
    ['2026-11-05T02:59:59.999Z', '23:59'],
    ['2026-11-05T03:00:00.000Z', '00:00'],
  ])('%s → %s (fuso local, 24 h)', (iso, expected) => {
    expect(formatTime(iso)).toBe(expected);
  });
});
