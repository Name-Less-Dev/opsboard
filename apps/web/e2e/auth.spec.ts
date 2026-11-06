import { expect, test } from '@playwright/test';
import { USERS } from './support/env.ts';
import { loginThroughUi } from './support/session.ts';

// Contexto limpo: sem a sessão salva pelo setup.
test.use({ storageState: { cookies: [], origins: [] } });

test('rota protegida leva ao login e volta para ela depois de entrar', async ({ page }) => {
  await page.goto('/orders?status=OPEN');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('E-mail').fill(USERS.operator.email);
  await page.getByLabel('Senha').fill(process.env.E2E_PASSWORD ?? 'e2e-senha-de-teste-123');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL(/\/orders\?status=OPEN$/);
  await expect(page.getByRole('checkbox', { name: 'Aberta' })).toBeChecked();
});

test('senha errada e e-mail inexistente mostram a mesma mensagem, sem revelar o e-mail', async ({
  page,
}) => {
  await page.goto('/login');
  for (const email of [USERS.operator.email, 'ninguem@e2e.opsboard.test']) {
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill('senha-errada');
    await page.getByRole('button', { name: 'Entrar' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('E-mail ou senha inválidos.');
    await expect(alert).not.toContainText('@');
    await expect(page).toHaveURL(/\/login$/);
  }
});

test('recarregar mantém a sessão; sair leva ao login e a rota volta a ser protegida', async ({
  page,
}) => {
  await loginThroughUi(page, USERS.supervisor.email);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Painel' })).toBeVisible();
  await expect(page.getByText(USERS.supervisor.name)).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
