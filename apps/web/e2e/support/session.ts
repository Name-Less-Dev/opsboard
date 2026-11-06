import { expect, type Browser, type Page } from '@playwright/test';
import { E2E_PASSWORD, STORAGE } from './env.ts';

/** Entra pela tela de login e espera o painel. */
export async function loginThroughUi(page: Page, email: string, password = E2E_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Painel' })).toBeVisible();
}

/** Outra sessão, num contexto separado (ex.: a supervisora mudando algo "por fora"). */
export async function openSession(browser: Browser, profile: keyof typeof STORAGE) {
  const context = await browser.newContext({ storageState: STORAGE[profile] });
  const page = await context.newPage();
  return { context, page };
}
