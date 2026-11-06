import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

// Capturas do README (`npm run e2e:screenshots`): mesma pilha e mesmo banco do e2e, mas só o
// spec `@screenshots`, que a configuração normal (e o CI) ignora.
export default defineConfig({
  ...base,
  testIgnore: [],
  retries: 0,
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'screenshots',
      testMatch: /screenshots\.spec\.ts/,
      grep: /@screenshots/,
      // Campos nativos (data, arquivo) do Chromium headless saem em inglês: ele não traz as
      // traduções da interface, e o `locale` do contexto não muda esses controles.
      dependencies: ['setup'],
    },
  ],
});
