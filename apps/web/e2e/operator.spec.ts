import { expect, test } from '@playwright/test';
import { STORAGE, USERS } from './support/env.ts';
import { uniqueTitle } from './support/data.ts';
import { createOrder, historySentences, runAction } from './support/orders.ts';
import { openOrderByTitle } from './support/ui.ts';

test.use({ storageState: STORAGE.operator });

const me = USERS.operator.name;

test('cria a própria ordem, inicia, conclui e o histórico conta isso em ordem', async ({
  page,
}) => {
  const title = uniqueTitle('Operador');
  await page.goto('/orders/new');
  // O responsável é ele mesmo, só para leitura: não há seletor de responsável.
  await expect(page.getByText(`${me} (você)`)).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Responsável' })).toHaveCount(0);

  await createOrder(page, { title, priority: 'Alta' });
  const actions = page.getByRole('group', { name: 'Ações da ordem' });
  // O operador nunca cancela, atribui nem exclui.
  await expect(actions.getByRole('button', { name: 'Cancelar ordem' })).toHaveCount(0);
  await expect(actions.getByRole('button', { name: 'Excluir ordem' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Atribuir responsável' })).toHaveCount(0);

  await runAction(page, 'Iniciar ordem', 'Ordem iniciada.');
  await runAction(page, 'Concluir ordem', 'Ordem concluída.');

  // Mais recente primeiro: concluída, iniciada, criada.
  await expect
    .poll(() => historySentences(page))
    .toEqual([
      `${me} concluiu a ordem`,
      `${me} iniciou a ordem (Aberta → Em andamento)`,
      `${me} criou a ordem`,
    ]);
  // Estado final: nenhuma ação para o operador.
  await expect(page.getByRole('group', { name: 'Ações da ordem' })).toHaveCount(0);
});

test('numa ordem [seed] de outra pessoa não pode iniciar nem concluir', async ({ page }) => {
  // Aberta e com a Olga como responsável (seed-e2e.ts, índice 8).
  await openOrderByTitle(page, '[seed] Limpar calha - copa');
  await expect(page.getByText(USERS.otherOperator.name).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar ordem' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Concluir ordem' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Editar ordem' })).toHaveCount(0);
});
