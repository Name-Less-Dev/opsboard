import { expect, test } from '@playwright/test';
import { STORAGE } from './support/env.ts';
import { listTotal } from './support/ui.ts';

test.use({ storageState: STORAGE.supervisor });

// O checkbox é controlado pela URL: o clique navega e a tela marca depois. Por isso clique e
// asserção (que espera), em vez de `check()`, que exige a mudança no mesmo instante.
async function check(page: import('@playwright/test').Page, name: string) {
  const box = page.getByRole('checkbox', { name });
  await box.click();
  await expect(box).toBeChecked();
}

const table = (page: import('@playwright/test').Page) =>
  page.getByRole('table', { name: 'Ordens de serviço' });

test('filtro de status na URL sobrevive ao F5 e a colar a URL em outra aba', async ({
  page,
  context,
}) => {
  await page.goto('/orders?status=DONE');
  await expect(page.getByRole('checkbox', { name: 'Concluída' })).toBeChecked();
  const total = await listTotal(page);

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Concluída' })).toBeChecked();
  expect(await listTotal(page)).toBe(total);

  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByRole('checkbox', { name: 'Concluída' })).toBeChecked();
  expect(await listTotal(other)).toBe(total);
  await other.close();
});

test('busca com debounce acha um título [seed] único e a URL reflete', async ({ page }) => {
  const title = '[seed] Pintar parede - auditório';
  await page.goto('/orders');
  await page.getByLabel('Buscar').fill(title);

  await expect(page).toHaveURL(/[?&]q=/);
  expect(new URL(page.url()).searchParams.get('q')).toBe(title);
  expect(await listTotal(page)).toBe(1);
  await expect(table(page).getByRole('link', { name: title, exact: true })).toBeVisible();
});

test('voltar e avançar do navegador restauram os filtros', async ({ page }) => {
  await page.goto('/orders');
  await check(page, 'Aberta');
  await expect(page).toHaveURL(/status=OPEN/);
  await check(page, 'Urgente');
  await expect(page).toHaveURL(/priority=URGENT/);

  await page.goBack();
  await expect(page).not.toHaveURL(/priority=/);
  await expect(page.getByRole('checkbox', { name: 'Urgente' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Aberta' })).toBeChecked();

  await page.goForward();
  await expect(page).toHaveURL(/priority=URGENT/);
  await expect(page.getByRole('checkbox', { name: 'Urgente' })).toBeChecked();
});

test('"Limpar filtros" só aparece com filtro ativo', async ({ page }) => {
  const clear = page.getByRole('button', { name: 'Limpar filtros' });
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Resultados' })).toBeVisible();
  await expect(clear).toHaveCount(0);

  await check(page, 'Cancelada');
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(clear).toHaveCount(0);
  await expect(page).toHaveURL(/\/orders$/);
});

test('página 2 não repete itens da página 1', async ({ page }) => {
  // Só as 45 do seed (3 páginas de 20), para nenhum outro teste mexer no conjunto.
  await page.goto(`/orders?q=${encodeURIComponent('[seed]')}`);
  expect(await listTotal(page)).toBe(45);
  const links = table(page).getByRole('link');
  await expect(links).toHaveCount(20);
  const first = await links.allInnerTexts();

  await page
    .getByRole('navigation', { name: 'Paginação' })
    .getByRole('button', { name: 'Próxima' })
    .click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toContainText('Página 2 de 3');
  await expect(links).toHaveCount(20);
  const second = await links.allInnerTexts();

  expect(second.filter((title) => first.includes(title))).toEqual([]);
});

test('busca sem resultado mostra o vazio de filtros com "Limpar filtros"', async ({ page }) => {
  await page.goto(`/orders?q=${encodeURIComponent('nada-existe-e2e-zzz')}`);
  await expect(page.getByText('Nenhuma ordem encontrada com esses filtros.')).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Limpar filtros' }).last().click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByText('Nenhuma ordem encontrada com esses filtros.')).toHaveCount(0);
});
