import { expect, type Page } from '@playwright/test';
import { localDateFromNow } from './data.ts';

export type NewOrder = {
  title: string;
  priority?: 'Baixa' | 'Média' | 'Alta' | 'Urgente';
  dueInDays?: number;
  /** Rótulo da opção no seletor (só supervisor), ex.: "Olga Operadora (Operador)". */
  assignee?: string;
};

/** Cria pela tela "Nova ordem" e espera o detalhe. Devolve o id (da URL). */
export async function createOrder(page: Page, order: NewOrder): Promise<string> {
  await page.goto('/orders/new');
  return submitOrderForm(page, order);
}

/** Preenche e envia o formulário de "Nova ordem" já aberto (sem recarregar a página). */
export async function submitOrderForm(page: Page, order: NewOrder): Promise<string> {
  await page.getByLabel('Título').fill(order.title);
  await page.getByLabel('Prioridade').selectOption({ label: order.priority ?? 'Média' });
  await page.getByLabel('Prazo', { exact: true }).fill(localDateFromNow(order.dueInDays ?? 10));
  if (order.assignee) {
    await page.getByLabel('Responsável').selectOption({ label: order.assignee });
  }
  await page.getByRole('button', { name: 'Criar ordem' }).click();
  await expect(page.getByRole('heading', { level: 1, name: order.title })).toBeVisible();
  const id = /\/orders\/([0-9a-f-]{36})$/.exec(page.url())?.[1];
  if (!id) throw new Error(`URL inesperada depois de criar: ${page.url()}`);
  return id;
}

/** Frases da linha do tempo, da mais recente para a mais antiga (só a frase principal). */
export async function historySentences(page: Page): Promise<string[]> {
  const items = page.getByRole('list', { name: 'Histórico da ordem' }).locator(':scope > li p');
  await expect(items.first()).toBeVisible();
  return items.allInnerTexts();
}

/** Clica numa ação do detalhe e espera o aviso de sucesso. */
export async function runAction(page: Page, action: string, success: string) {
  await page
    .getByRole('group', { name: 'Ações da ordem' })
    .getByRole('button', { name: action })
    .click();
  await expect(page.getByRole('status').filter({ hasText: success })).toBeVisible();
}
