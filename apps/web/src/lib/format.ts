// Formatação para exibição em pt-BR, no fuso do navegador (a API manda instantes em UTC).

const numberFormat = new Intl.NumberFormat('pt-BR');

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatCount(count: number, singular: string, plural: string): string {
  return `${numberFormat.format(count)} ${count === 1 ? singular : plural}`;
}

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Instante ISO (UTC) exibido no fuso do navegador, ex.: "04/11/2026, 14:00". */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Só a hora de um instante ISO, no fuso do navegador, ex.: "14:05". */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}
