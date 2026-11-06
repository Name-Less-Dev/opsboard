import { randomUUID } from 'node:crypto';

/** Título único por teste: prefixo `E2E-` e sufixo aleatório, para nunca colidir com outro teste. */
export function uniqueTitle(label: string): string {
  return `E2E-${label}-${randomUUID().slice(0, 8)}`;
}

/** Data local AAAA-MM-DD daqui a `days` dias (o fuso do teste é America/Sao_Paulo). */
export function localDateFromNow(days: number, now = new Date()): string {
  const date = new Date(now.getTime() + days * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Número em pt-BR ("1.234") para inteiro. */
export function parseCount(text: string): number {
  const match = /(\d[\d.]*)/.exec(text);
  if (!match) throw new Error(`Sem número em "${text}"`);
  return Number(match[1].replaceAll('.', ''));
}
