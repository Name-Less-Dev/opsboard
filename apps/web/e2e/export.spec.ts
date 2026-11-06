import { expect, test, type Page } from '@playwright/test';
import { STORAGE } from './support/env.ts';
import { readDownloadedCsv } from './support/csv.ts';
import { uniqueTitle } from './support/data.ts';
import { createOrder } from './support/orders.ts';
import { listTotal } from './support/ui.ts';

test.use({ storageState: STORAGE.supervisor });

const HEADER = [
  'id',
  'title',
  'description',
  'priority',
  'status',
  'dueDate',
  'assigneeName',
  'createdByName',
  'createdAt',
  'updatedAt',
];

async function exportCsv(page: Page, path: string) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  const download = await downloading;
  await download.saveAs(path);
  return { filename: download.suggestedFilename(), csv: await readDownloadedCsv(path) };
}

test('exporta a lista filtrada: BOM, `;`, cabeçalho, sem e-mail e o mesmo total', async ({
  page,
}, testInfo) => {
  await page.goto(`/orders?status=CANCELLED&q=${encodeURIComponent('[seed]')}`);
  const total = await listTotal(page);
  await expect(page.getByRole('button', { name: 'Exportar CSV' })).toHaveAccessibleDescription(
    `Exporta os ${total} resultados filtrados`,
  );

  const { filename, csv } = await exportCsv(page, testInfo.outputPath('export.csv'));

  expect(filename).toMatch(/^opsboard-ordens-\d{8}-\d{4}\.csv$/);
  expect([...csv.bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(csv.bytes.toString('utf8').split('\r\n')[0]).toBe(
    `${String.fromCharCode(0xfeff)}${HEADER.join(';')}`,
  );
  expect(csv.header).toEqual(HEADER);
  expect(csv.rows).toHaveLength(total);
  expect(csv.rows.every((row) => row[4] === 'Cancelada' && row[1].startsWith('[seed]'))).toBe(true);
  expect(csv.bytes.toString('utf8')).not.toContain('@');
});

test('título que parece fórmula sai com apóstrofo no CSV e continua igual na tela', async ({
  page,
}, testInfo) => {
  const marker = uniqueTitle('Formula');
  const title = `=2+2 ${marker}`;
  await createOrder(page, { title });

  await page.goto(`/orders?q=${encodeURIComponent(marker)}`);
  expect(await listTotal(page)).toBe(1);
  const { csv } = await exportCsv(page, testInfo.outputPath('formula.csv'));

  expect(csv.rows).toHaveLength(1);
  expect(csv.rows[0][1]).toBe(`'${title}`);
  await expect(
    page
      .getByRole('table', { name: 'Ordens de serviço' })
      .getByRole('link', { name: title, exact: true }),
  ).toBeVisible();
});
