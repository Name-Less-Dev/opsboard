import { expect, type Page } from '@playwright/test';
import { parseCount } from './data.ts';

// Leituras feitas pela interface, como uma pessoa faria: nada de consultar o banco por fora.

/**
 * Total da lista na tela, lido do anúncio "N ordens encontradas" (região aria-live). Ele só é
 * preenchido quando a lista está assentada (sem requisição a caminho), então já espera sozinho.
 */
export async function listTotal(page: Page): Promise<number> {
  const announcement = page.getByText(/^[\d.]+ ordens? encontradas?$/);
  await expect(announcement).toHaveCount(1);
  return parseCount((await announcement.textContent()) ?? '');
}

export const DASHBOARD_CARDS = [
  'Abertas',
  'Em andamento',
  'Concluídas',
  'Canceladas',
  'Atrasadas',
] as const;
export type DashboardCard = (typeof DASHBOARD_CARDS)[number];

/** Link do card no painel ("Abertas: 12 ordens, ver lista"). */
export function dashboardCard(page: Page, card: DashboardCard) {
  return page.getByRole('link', { name: new RegExp(`^${card}: [\\d.]+ ordens?, ver lista$`) });
}

/** Número de um card do painel, lido do nome acessível do link. */
export async function dashboardCount(page: Page, card: DashboardCard): Promise<number> {
  const link = dashboardCard(page, card);
  await expect(link).toBeVisible();
  return parseCount((await link.getAttribute('aria-label')) ?? '');
}

/** Abre o detalhe de uma ordem a partir da busca da lista, pelo título exato. */
export async function openOrderByTitle(page: Page, title: string) {
  await page.goto(`/orders?q=${encodeURIComponent(title)}`);
  await page.getByRole('link', { name: title, exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}
