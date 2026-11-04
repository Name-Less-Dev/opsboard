import { afterEach, describe, expect, it, vi } from 'vitest';
import { endOfLocalDayIso, isoToDateInput, startOfLocalDayIso, todayDateInput } from './dates';

afterEach(() => vi.unstubAllEnvs());

// O fuso padrão dos testes é America/Sao_Paulo (UTC-3); alguns casos trocam o TZ do processo.
describe('conversões de data local', () => {
  it.each([
    ['2026-11-04', '2026-11-05T02:59:59.999Z'],
    ['2026-12-31', '2027-01-01T02:59:59.999Z'],
    ['2028-02-29', '2028-03-01T02:59:59.999Z'],
  ])('endOfLocalDayIso(%s) = %s (fim do dia local)', (date, expected) => {
    expect(endOfLocalDayIso(date)).toBe(expected);
  });

  it('startOfLocalDayIso é o início do dia local', () => {
    expect(startOfLocalDayIso('2026-11-04')).toBe('2026-11-04T03:00:00.000Z');
  });

  it.each([
    // Instante no fim do dia em UTC ainda é o mesmo dia em São Paulo.
    ['2026-11-04T23:59:59.000Z', '2026-11-04'],
    // 02:00 UTC do dia 5 ainda é dia 4 em São Paulo (23:00).
    ['2026-11-05T02:00:00.000Z', '2026-11-04'],
    ['2026-11-05T03:00:00.000Z', '2026-11-05'],
  ])('isoToDateInput(%s) = %s (dia no fuso local)', (iso, expected) => {
    expect(isoToDateInput(iso)).toBe(expected);
  });

  it.each(['America/Sao_Paulo', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'UTC'])(
    'ida e volta em %s: o dia escolhido volta igual',
    (timeZone) => {
      vi.stubEnv('TZ', timeZone);
      for (const date of ['2026-01-01', '2026-03-08', '2026-11-04', '2026-12-31']) {
        expect(isoToDateInput(endOfLocalDayIso(date))).toBe(date);
        expect(isoToDateInput(startOfLocalDayIso(date))).toBe(date);
      }
    },
  );

  it('o mesmo dia escolhido vira instantes diferentes conforme o fuso', () => {
    vi.stubEnv('TZ', 'Asia/Tokyo');
    expect(endOfLocalDayIso('2026-11-04')).toBe('2026-11-04T14:59:59.999Z');
    vi.stubEnv('TZ', 'Pacific/Pago_Pago');
    expect(endOfLocalDayIso('2026-11-04')).toBe('2026-11-05T10:59:59.999Z');
  });

  it('todayDateInput usa o dia local, não o de UTC', () => {
    // 01:00 UTC do dia 5 = 22:00 do dia 4 em São Paulo.
    expect(todayDateInput(new Date('2026-11-05T01:00:00.000Z'))).toBe('2026-11-04');
  });
});
