import { mkdirSync } from 'node:fs';
import { test as setup } from '@playwright/test';
import { AUTH_DIR, STORAGE, USERS } from './support/env.ts';
import { loginThroughUi } from './support/session.ts';

// Login pela tela, uma vez por perfil; os outros testes reaproveitam a sessão (localStorage).
setup.beforeAll(() => {
  mkdirSync(AUTH_DIR, { recursive: true });
});

setup('sessão do operador', async ({ page }) => {
  await loginThroughUi(page, USERS.operator.email);
  await page.context().storageState({ path: STORAGE.operator });
});

setup('sessão da supervisora', async ({ page }) => {
  await loginThroughUi(page, USERS.supervisor.email);
  await page.context().storageState({ path: STORAGE.supervisor });
});
