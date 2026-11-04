// Conversões entre a data local do `<input type="date">` (AAAA-MM-DD) e instantes ISO em UTC,
// que é o que a API guarda e compara. `new Date(ano, mês, dia, ...)` interpreta no fuso do
// navegador; `toISOString` devolve o mesmo instante em UTC.

/** Data local no formato AAAA-MM-DD, como a do `<input type="date">`. */
export type LocalDate = string;

function parts(date: LocalDate): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year, month - 1, day];
}

export function startOfLocalDayIso(date: LocalDate): string {
  const [year, month, day] = parts(date);
  return new Date(year, month, day, 0, 0, 0, 0).toISOString();
}

/** Prazo escolhido num dia vale até o último milissegundo desse dia, no fuso de quem escolheu. */
export function endOfLocalDayIso(date: LocalDate): string {
  const [year, month, day] = parts(date);
  return new Date(year, month, day, 23, 59, 59, 999).toISOString();
}

const pad = (value: number) => String(value).padStart(2, '0');

function toLocalDate(date: Date): LocalDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Dia, no fuso do navegador, em que cai um instante da API (valor para o input). */
export function isoToDateInput(iso: string): LocalDate {
  return toLocalDate(new Date(iso));
}

export function todayDateInput(now: Date = new Date()): LocalDate {
  return toLocalDate(now);
}
