import { expect, test } from '@playwright/test';
import { STORAGE } from './support/env.ts';

test.use({ storageState: STORAGE.operator });

for (const scheme of ['light', 'dark'] as const) {
  test(`primeira visita acompanha prefers-color-scheme: ${scheme}`, async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: scheme,
      storageState: STORAGE.operator,
    });
    const page = await context.newPage();
    await page.goto('/dashboard');
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    await context.close();
  });
}

test('a escolha do tema vale mais que o sistema e sobrevive ao F5', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark', storageState: STORAGE.operator });
  const page = await context.newPage();
  await page.goto('/dashboard');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Tema escuro' })).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await context.close();
});
