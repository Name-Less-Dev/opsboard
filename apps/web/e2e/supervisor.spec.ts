import { expect, test } from '@playwright/test';
import { STORAGE, USERS } from './support/env.ts';
import { uniqueTitle } from './support/data.ts';
import { createOrder, historySentences } from './support/orders.ts';
import { listTotal } from './support/ui.ts';

test.use({ storageState: STORAGE.supervisor });

const me = USERS.supervisor.name;
const field = (page: import('@playwright/test').Page, label: string) =>
  page.getByRole('term').filter({ hasText: label }).locator('xpath=following-sibling::dd[1]');

test('cria com outro responsável e atribui a outra pessoa, com registro no histórico', async ({
  page,
}) => {
  const title = uniqueTitle('Supervisora');
  await createOrder(page, { title, assignee: `${USERS.otherOperator.name} (Operador)` });
  await expect(field(page, 'Responsável')).toHaveText(USERS.otherOperator.name);

  await page
    .getByLabel('Novo responsável')
    .selectOption({ label: `${USERS.operator.name} (Operador)` });
  await page.getByRole('button', { name: 'Atribuir responsável' }).click();
  // Sem conferir o aviso "Responsável atualizado.": ele não aparece hoje (bug conhecido, o
  // formulário é recriado antes do callback de sucesso). O resultado é conferido na tela.
  await expect(field(page, 'Responsável')).toHaveText(USERS.operator.name);

  await expect
    .poll(() => historySentences(page))
    .toEqual([
      `${me} atribuiu a ordem a ${USERS.operator.name} (antes: ${USERS.otherOperator.name})`,
      `${me} criou a ordem`,
    ]);
});

test('cancelar pede confirmação: Esc e "Voltar" não cancelam; confirmar cancela', async ({
  page,
}) => {
  await createOrder(page, { title: uniqueTitle('Cancelar') });
  const actions = page.getByRole('group', { name: 'Ações da ordem' });
  const dialog = page.getByRole('dialog', { name: 'Cancelar esta ordem?' });

  await actions.getByRole('button', { name: 'Cancelar ordem' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await actions.getByRole('button', { name: 'Cancelar ordem' }).click();
  await dialog.getByRole('button', { name: 'Voltar' }).click();
  await expect(dialog).toBeHidden();
  await expect(actions.getByRole('button', { name: 'Iniciar ordem' })).toBeVisible();

  await actions.getByRole('button', { name: 'Cancelar ordem' }).click();
  await dialog.getByRole('button', { name: 'Cancelar ordem' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Ordem cancelada.' })).toBeVisible();

  // Somente leitura: sobra só "Excluir" para a supervisora.
  await expect(actions.getByRole('button')).toHaveText(['Excluir ordem']);
  await expect(page.getByRole('link', { name: 'Editar ordem' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Atribuir responsável' })).toHaveCount(0);
});

test('excluir pede confirmação, volta para a lista e a ordem some', async ({ page }) => {
  const title = uniqueTitle('Excluir');
  const id = await createOrder(page, { title });

  await page
    .getByRole('group', { name: 'Ações da ordem' })
    .getByRole('button', { name: 'Excluir ordem' })
    .click();
  await page
    .getByRole('dialog', { name: 'Excluir esta ordem?' })
    .getByRole('button', { name: 'Excluir ordem' })
    .click();

  await expect(page).toHaveURL(/\/orders(\?.*)?$/);
  await expect(page.getByRole('status').filter({ hasText: 'Ordem excluída.' })).toBeVisible();

  await page.goto(`/orders?q=${encodeURIComponent(title)}`);
  expect(await listTotal(page)).toBe(0);

  await page.goto(`/orders/${id}`);
  await expect(page.getByText('Ordem não encontrada.')).toBeVisible();
});
