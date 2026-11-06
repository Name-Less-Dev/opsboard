import { expect, test, type Page } from '@playwright/test';
import { E2E_PASSWORD, STORAGE, USERS } from './support/env.ts';
import { localDateFromNow, uniqueTitle } from './support/data.ts';

// Só no projeto `mobile` (Chromium com viewport e toque de celular).

async function expectNoHorizontalScroll(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

test.describe('celular', { tag: '@mobile' }, () => {
  test.describe('sem sessão', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('login sem rolagem horizontal e entrando pelo teclado', async ({ page }) => {
      await page.goto('/login');
      await expectNoHorizontalScroll(page);
      await page.getByLabel('E-mail').pressSequentially(USERS.operator.email);
      await page.getByLabel('Senha').pressSequentially(E2E_PASSWORD);
      await page.getByLabel('Senha').press('Enter');
      await expect(page.getByRole('heading', { level: 1, name: 'Painel' })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  });

  test.describe('operador', () => {
    test.use({ storageState: STORAGE.operator });

    test('painel e lista sem rolagem horizontal; a lista aparece em cartões', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByRole('link', { name: /^Abertas: / })).toBeVisible();
      await expectNoHorizontalScroll(page);

      await page.goto('/orders');
      await expect(page.getByRole('list', { name: 'Ordens de serviço' })).toBeVisible();
      await expect(page.getByRole('table', { name: 'Ordens de serviço' })).toBeHidden();
      await expectNoHorizontalScroll(page);
    });

    test('criar ordem digitando e enviando pelo teclado', async ({ page }) => {
      const title = uniqueTitle('Celular');
      await page.goto('/orders/new');
      await expectNoHorizontalScroll(page);

      const titleField = page.getByLabel('Título');
      await titleField.tap();
      await titleField.pressSequentially(title);
      await page.getByLabel('Prioridade').selectOption({ label: 'Alta' });
      await page.getByLabel('Prazo', { exact: true }).fill(localDateFromNow(5));
      // "Ir"/"Enviar" do teclado virtual: Enter num campo de texto envia o formulário.
      await titleField.press('Enter');

      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: 'Ordem criada.' })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  });
});
