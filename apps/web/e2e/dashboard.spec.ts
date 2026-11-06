import { expect, test } from '@playwright/test';
import { STORAGE } from './support/env.ts';
import { uniqueTitle } from './support/data.ts';
import { runAction, submitOrderForm } from './support/orders.ts';
import { dashboardCard, dashboardCount, DASHBOARD_CARDS, listTotal } from './support/ui.ts';

test.use({ storageState: STORAGE.supervisor });

for (const card of DASHBOARD_CARDS) {
  test(`card "${card}" leva a uma lista com o mesmo total`, async ({ page }) => {
    await page.goto('/dashboard');
    const count = await dashboardCount(page, card);
    await dashboardCard(page, card).click();
    await expect(page).toHaveURL(/\/orders\?/);
    expect(await listTotal(page)).toBe(count);
  });
}

test('criar e concluir uma ordem em outra tela muda o painel sem F5', async ({ page }) => {
  await page.goto('/dashboard');
  const before = {
    open: await dashboardCount(page, 'Abertas'),
    done: await dashboardCount(page, 'Concluídas'),
  };

  // Navegação dentro do app (sem recarregar): o cache do painel continua vivo.
  await page.getByRole('link', { name: 'Ordens', exact: true }).click();
  await page.getByRole('link', { name: 'Nova ordem' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Nova ordem' })).toBeVisible();
  await submitOrderForm(page, { title: uniqueTitle('Painel') });
  await runAction(page, 'Iniciar ordem', 'Ordem iniciada.');
  await runAction(page, 'Concluir ordem', 'Ordem concluída.');

  await page.getByRole('link', { name: 'Painel', exact: true }).click();
  await expect.poll(() => dashboardCount(page, 'Concluídas')).toBe(before.done + 1);
  expect(await dashboardCount(page, 'Abertas')).toBe(before.open);
});
