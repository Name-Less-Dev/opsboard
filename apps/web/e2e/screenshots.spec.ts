import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { REPO_ROOT, STORAGE } from './support/env.ts';
import { openOrderByTitle } from './support/ui.ts';

// Gera as capturas de docs/screenshots/ com os dados fictícios do seed e2e. Fora da execução
// normal e do CI: roda só com `npm run e2e:screenshots`.

const OUT = path.join(REPO_ROOT, 'docs/screenshots');
const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} as const;

type Screen = { name: string; fullPage: boolean; open: (page: Page) => Promise<void> };

const SCREENS: Screen[] = [
  {
    name: 'painel',
    fullPage: false,
    open: async (page) => {
      await page.goto('/dashboard');
      await expect(page.getByRole('link', { name: /^Abertas: / })).toBeVisible();
    },
  },
  {
    name: 'lista-filtros',
    fullPage: false,
    open: async (page) => {
      await page.goto('/orders?status=OPEN,IN_PROGRESS&priority=HIGH,URGENT');
      await expect(page.getByText(/^[\d.]+ (ordem encontrada|ordens encontradas)$/)).toHaveCount(1);
    },
  },
  {
    name: 'detalhe-historico',
    fullPage: true,
    open: async (page) => {
      // Concluída, com atribuição, edição, início e conclusão no histórico.
      await openOrderByTitle(page, '[seed] Pintar parede - almoxarifado');
      await expect(
        page.getByRole('list', { name: 'Histórico da ordem' }).locator(':scope > li'),
      ).toHaveCount(5);
    },
  },
  {
    name: 'importacao-erros',
    fullPage: true,
    open: async (page) => {
      await page.goto('/orders/import');
      await page
        .getByLabel('Arquivo CSV')
        .setInputFiles(path.join(REPO_ROOT, 'docs/examples/ordens-com-erros.csv'));
      await page.getByRole('button', { name: 'Validar arquivo' }).click();
      await expect(page.getByRole('table', { name: 'Erros por linha do arquivo' })).toBeVisible();
      // O foco vai para o resumo; tira o anel de foco da imagem.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    },
  },
];

for (const [device, options] of Object.entries(DEVICES)) {
  for (const theme of ['light', 'dark'] as const) {
    for (const screen of SCREENS) {
      test(`${screen.name} ${theme} ${device}`, { tag: '@screenshots' }, async ({ browser }) => {
        const context = await browser.newContext({
          ...options,
          deviceScaleFactor: 1,
          locale: 'pt-BR',
          timezoneId: 'America/Sao_Paulo',
          colorScheme: theme,
          reducedMotion: 'reduce',
          storageState: STORAGE.supervisor,
        });
        const page = await context.newPage();
        await screen.open(page);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.screenshot({
          path: path.join(OUT, `${screen.name}-${theme}-${device}.png`),
          fullPage: screen.fullPage,
          animations: 'disabled',
        });
        await context.close();
      });
    }
  }
}
