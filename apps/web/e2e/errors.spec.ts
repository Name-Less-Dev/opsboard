import { expect, test } from '@playwright/test';
import { STORAGE } from './support/env.ts';
import { uniqueTitle } from './support/data.ts';
import { createOrder } from './support/orders.ts';
import { openSession } from './support/session.ts';

test.use({ storageState: STORAGE.supervisor });

const isList = (url: URL) => url.pathname === '/api/work-orders';
const isHistory = (url: URL) => /^\/api\/work-orders\/[0-9a-f-]+\/events$/.test(url.pathname);

test('500 na lista: ErrorState com requestId; "Tentar de novo" recupera sem a falha', async ({
  page,
}) => {
  await page.route(isList, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Erro interno',
        path: '/work-orders',
        timestamp: new Date().toISOString(),
        requestId: 'e2e-falha-500',
      }),
    }),
  );
  await page.goto('/orders');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Ocorreu um erro inesperado no servidor.');
  await expect(alert).toContainText('e2e-falha-500');

  await page.unroute(isList);
  await alert.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(/^[\d.]+ (ordem encontrada|ordens encontradas)$/)).toHaveCount(1);
});

test('falha de rede só no histórico: o erro fica na seção e o resto do detalhe funciona', async ({
  page,
}) => {
  const title = uniqueTitle('Historico');
  await createOrder(page, { title });

  await page.route(isHistory, (route) => route.abort('connectionfailed'));
  await page.reload();

  const history = page.getByRole('region', { name: 'Histórico' });
  await expect(history.getByRole('alert')).toContainText('Não foi possível falar com o servidor');
  // O resto continua de pé: título, dados e ações.
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(1);
  const start = page.getByRole('group', { name: 'Ações da ordem' }).getByRole('button', {
    name: 'Iniciar ordem',
  });
  await expect(start).toBeEnabled();

  await page.unroute(isHistory);
  await history.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(history.getByRole('alert')).toHaveCount(0);
  await expect(history.getByRole('list', { name: 'Histórico da ordem' })).toContainText(
    'criou a ordem',
  );
});

test('409: outra sessão cancela antes; a tela mostra a mensagem do code e se corrige', async ({
  page,
  browser,
}) => {
  const id = await createOrder(page, { title: uniqueTitle('Conflito') });
  const actions = page.getByRole('group', { name: 'Ações da ordem' });
  await expect(actions.getByRole('button', { name: 'Iniciar ordem' })).toBeVisible();

  // Outra aba da supervisora cancela a mesma ordem.
  const other = await openSession(browser, 'supervisor');
  await other.page.goto(`/orders/${id}`);
  await other.page
    .getByRole('group', { name: 'Ações da ordem' })
    .getByRole('button', { name: 'Cancelar ordem' })
    .click();
  await other.page.getByRole('dialog').getByRole('button', { name: 'Cancelar ordem' }).click();
  await expect(
    other.page.getByRole('status').filter({ hasText: 'Ordem cancelada.' }),
  ).toBeVisible();
  await other.context.close();

  // Esta tela ainda acha que a ordem está aberta. Cancelada → em andamento está fora do grafo,
  // então o code é INVALID_TRANSITION (o fluxo vem antes da permissão).
  await actions.getByRole('button', { name: 'Iniciar ordem' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Essa mudança de status não é mais possível: a ordem mudou. Os dados foram atualizados.',
  );
  await expect(actions.getByRole('button')).toHaveText(['Excluir ordem']);
});
