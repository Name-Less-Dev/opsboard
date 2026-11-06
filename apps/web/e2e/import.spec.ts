import path from 'node:path';
import { expect, test } from '@playwright/test';
import { REPO_ROOT, STORAGE, USERS } from './support/env.ts';
import { buildValidImportCsv } from './support/csv.ts';
import { uniqueTitle } from './support/data.ts';
import { historySentences } from './support/orders.ts';
import { dashboardCount, listTotal } from './support/ui.ts';

const ERRORS_FILE = path.join(REPO_ROOT, 'docs/examples/ordens-com-erros.csv');

test.describe('supervisora', () => {
  test.use({ storageState: STORAGE.supervisor });

  test('ordens-com-erros.csv: relatório por linha e coluna, importar desabilitado', async ({
    page,
  }) => {
    await page.goto('/orders/import');
    await page.getByLabel('Arquivo CSV').setInputFiles(ERRORS_FILE);
    await page.getByRole('button', { name: 'Validar arquivo' }).click();

    // No banco e2e não existem os e-mails do seed de desenvolvimento (ana@, bruno@): as linhas
    // 2 e 11 também acusam responsável desconhecido.
    await expect(
      page.getByRole('heading', { name: 'Arquivo com erros: 11 linhas, 1 válida, 10 com erro.' }),
    ).toBeFocused();
    const rows = page.getByRole('table', { name: 'Erros por linha do arquivo' }).getByRole('row');
    await expect(rows).toHaveText([
      'LinhaColunaMensagem',
      /^2e-mail do responsável/,
      /^3título/,
      /^4título/,
      /^5título/,
      /^6prioridade/,
      /^7prazo/,
      /^8prazo/,
      /^9prazo/,
      /^10e-mail do responsável/,
      /^11prioridade/,
      /^11prazo/,
      /^11e-mail do responsável/,
    ]);
    await expect(page.getByRole('button', { name: /^Importar/ })).toBeDisabled();
  });

  test('CSV válido gerado em memória: valida, importa, e lista, painel e histórico refletem', async ({
    page,
  }) => {
    const batch = uniqueTitle('Import');
    const file = buildValidImportCsv([
      { title: `${batch} um`, priority: 'Alta', assigneeEmail: USERS.operator.email },
      { title: `${batch} dois`, priority: 'baixa' },
      { title: `${batch} três`, priority: 'URGENT' },
    ]);

    await page.goto('/dashboard');
    const openBefore = await dashboardCount(page, 'Abertas');

    await page.getByRole('link', { name: 'Ordens', exact: true }).click();
    await page.getByRole('link', { name: 'Importar CSV' }).click();
    await page
      .getByLabel('Arquivo CSV')
      .setInputFiles({ name: 'lote.csv', mimeType: 'text/csv', buffer: file });
    await page.getByRole('button', { name: 'Validar arquivo' }).click();
    await expect(
      page.getByRole('heading', { name: 'Arquivo válido: 3 linhas, 3 válidas, 0 com erro.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Importar 3 ordens' }).click();

    await expect(page).toHaveURL(/\/orders$/);
    await expect(
      page.getByRole('status').filter({ hasText: '3 ordens importadas.' }),
    ).toBeVisible();

    await page.getByLabel('Buscar').fill(batch);
    await expect(page).toHaveURL(/[?&]q=/);
    expect(await listTotal(page)).toBe(3);

    await page.getByRole('link', { name: 'Painel', exact: true }).click();
    await expect.poll(() => dashboardCount(page, 'Abertas')).toBe(openBefore + 3);

    await page.goto(`/orders?q=${encodeURIComponent(`${batch} um`)}`);
    await page
      .getByRole('link', { name: `${batch} um`, exact: true })
      .first()
      .click();
    await expect
      .poll(() => historySentences(page))
      .toEqual([`${USERS.supervisor.name} criou a ordem`]);
  });

  test('trocar o arquivo depois de validar desabilita importar de novo', async ({ page }) => {
    const file = (name: string) => ({
      name,
      mimeType: 'text/csv',
      buffer: buildValidImportCsv([{ title: uniqueTitle('Troca'), priority: 'Média' }]),
    });
    await page.goto('/orders/import');
    await page.getByLabel('Arquivo CSV').setInputFiles(file('primeiro.csv'));
    await page.getByRole('button', { name: 'Validar arquivo' }).click();
    await expect(page.getByRole('button', { name: 'Importar 1 ordem' })).toBeEnabled();

    await page.getByLabel('Arquivo CSV').setInputFiles(file('segundo.csv'));
    await expect(page.getByRole('button', { name: /^Importar/ })).toBeDisabled();
    await expect(page.getByText('Valide o arquivo para liberar a importação.')).toBeVisible();
  });
});

test.describe('operador', () => {
  test.use({ storageState: STORAGE.operator });

  test('não vê "Importar CSV" e a tela mostra acesso negado', async ({ page }) => {
    await page.goto('/orders');
    await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Importar CSV' })).toHaveCount(0);

    await page.goto('/orders/import');
    await expect(page.getByRole('alert')).toContainText('Acesso negado.');
    await expect(page.getByLabel('Arquivo CSV')).toHaveCount(0);
  });
});
