import { describe, expect, it } from 'vitest';
import { formatOverdueBy } from './overdue-by';

const NOW = new Date('2026-11-05T12:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Prazo `ms` antes de NOW. */
const dueBefore = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('formatOverdueBy', () => {
  it.each([
    ['1 ms', 1, 'há menos de 1 hora'],
    ['59 min', 59 * MINUTE, 'há menos de 1 hora'],
    ['59 min 59 s', HOUR - 1000, 'há menos de 1 hora'],
    ['60 min exatos', HOUR, 'há 1 hora'],
    ['1h59', 2 * HOUR - MINUTE, 'há 1 hora'],
    ['2 h', 2 * HOUR, 'há 2 horas'],
    ['23h59', DAY - MINUTE, 'há 23 horas'],
    ['24 h exatas', DAY, 'há 1 dia'],
    ['47h59', 2 * DAY - MINUTE, 'há 1 dia'],
    ['48 h', 2 * DAY, 'há 2 dias'],
    ['3 dias e meio', 3.5 * DAY, 'há 3 dias'],
    ['1.234 dias', 1234 * DAY, 'há 1.234 dias'],
  ])('atraso de %s → %s', (_label, ms, expected) => {
    expect(formatOverdueBy(dueBefore(ms), NOW)).toBe(expected);
  });

  it('prazo igual ou depois de "agora" (não deveria vir da API) cai em "menos de 1 hora"', () => {
    expect(formatOverdueBy(NOW.toISOString(), NOW)).toBe('há menos de 1 hora');
    expect(formatOverdueBy(dueBefore(-DAY), NOW)).toBe('há menos de 1 hora');
  });

  it('não depende do fuso: conta a diferença entre instantes, não dias de calendário', () => {
    // 23h59 de atraso atravessando a meia-noite local ainda é "há 23 horas".
    expect(formatOverdueBy('2026-11-04T03:01:00.000Z', new Date('2026-11-05T03:00:00.000Z'))).toBe(
      'há 23 horas',
    );
  });
});
