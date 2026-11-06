import { expect, test } from '@playwright/test';
import { STORAGE } from './support/env.ts';

test.use({ storageState: STORAGE.supervisor });

test('smoke: painel abre com a sessão salva', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Painel' })).toBeVisible();
});
