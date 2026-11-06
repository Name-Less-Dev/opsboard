import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { STORAGE } from './support/env.ts';
import { openOrderByTitle } from './support/ui.ts';

// axe em cada tela, nos dois temas. Falha com impacto `serious` ou `critical`; as menores vão
// como anexo do relatório (para revisar, sem travar a suíte).

const THEMES = ['light', 'dark'] as const;

async function audit(page: Page, testInfo: TestInfo, name: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  const minor = results.violations.filter((violation) => !blocking.includes(violation));
  if (minor.length > 0) {
    await testInfo.attach(`axe-menores-${name}.json`, {
      body: JSON.stringify(minor, null, 2),
      contentType: 'application/json',
    });
  }
  expect(
    blocking.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    })),
  ).toEqual([]);
}

for (const theme of THEMES) {
  test.describe(`tema ${theme}`, () => {
    test.use({ colorScheme: theme });

    test.describe('sem sessão', () => {
      test.use({ storageState: { cookies: [], origins: [] } });

      test('login', async ({ page }, testInfo) => {
        await page.goto('/login');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
        await audit(page, testInfo, `login-${theme}`);
      });
    });

    test.describe('supervisora', () => {
      test.use({ storageState: STORAGE.supervisor });

      test('painel', async ({ page }, testInfo) => {
        await page.goto('/dashboard');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.getByRole('link', { name: /^Abertas: / })).toBeVisible();
        await audit(page, testInfo, `painel-${theme}`);
      });

      test('lista', async ({ page }, testInfo) => {
        await page.goto('/orders?status=OPEN,IN_PROGRESS');
        await expect(page.getByRole('table', { name: 'Ordens de serviço' })).toBeVisible();
        await audit(page, testInfo, `lista-${theme}`);
      });

      test('detalhe', async ({ page }, testInfo) => {
        await openOrderByTitle(page, '[seed] Trocar lâmpada - recepção');
        await expect(page.getByRole('list', { name: 'Histórico da ordem' })).toBeVisible();
        await audit(page, testInfo, `detalhe-${theme}`);
      });

      test('importação com relatório de erros', async ({ page }, testInfo) => {
        await page.goto('/orders/import');
        await page.getByLabel('Arquivo CSV').setInputFiles({
          name: 'erros.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from('title;priority;dueDate\r\nab;Nenhuma;2020-01-01\r\n'),
        });
        await page.getByRole('button', { name: 'Validar arquivo' }).click();
        await expect(page.getByRole('table', { name: 'Erros por linha do arquivo' })).toBeVisible();
        await audit(page, testInfo, `importacao-${theme}`);
      });
    });
  });
}
