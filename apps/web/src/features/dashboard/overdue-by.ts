import { formatCount } from '../../lib/format';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Há quanto tempo o prazo passou, ex.: "há 3 dias". `now` é o `generatedAt` do painel, não o
 * relógio do navegador. Conta a diferença entre instantes (24 h = 1 dia), sem olhar o
 * calendário, então não depende do fuso. Arredonda para baixo: 23h59 ainda é "há 23 horas".
 */
export function formatOverdueBy(dueDate: string, now: Date): string {
  const elapsed = now.getTime() - new Date(dueDate).getTime();
  if (elapsed >= DAY_MS) return `há ${formatCount(Math.floor(elapsed / DAY_MS), 'dia', 'dias')}`;
  if (elapsed >= HOUR_MS) {
    return `há ${formatCount(Math.floor(elapsed / HOUR_MS), 'hora', 'horas')}`;
  }
  return 'há menos de 1 hora';
}
