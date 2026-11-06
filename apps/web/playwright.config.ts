import { defineConfig, devices } from '@playwright/test';
import {
  API_PORT,
  API_URL,
  E2E_DATABASE_URL,
  REPO_ROOT,
  WEB_PORT,
  WEB_URL,
} from './e2e/support/env.ts';

const CI = Boolean(process.env.CI);

// Testes e2e: navegador real → front compilado (vite preview) → API compilada → Postgres `_e2e`.
// Portas próprias e `reuseExistingServer: false`: nunca falar com um servidor de desenvolvimento.
// Serial (1 worker): os testes dividem um banco só.
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/screenshots.spec.ts'],
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  // Só no CI, e só para gravar o trace da falha: teste instável se corrige na causa.
  retries: CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: CI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      grepInvert: /@mobile/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      grep: /@mobile/,
    },
  ],
  webServer: [
    {
      // Compila e sobe a API como em produção (`start:prod`), apontando para o banco e2e.
      command: 'npm run build -w @opsboard/api && npm run start:prod -w @opsboard/api',
      cwd: REPO_ROOT,
      // Rota sem banco (401 sem token): a API fica pronta antes de o globalSetup recriar o banco.
      url: `${API_URL}/auth/me`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'production',
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        JWT_SECRET: 'segredo-so-do-e2e-com-mais-de-32-caracteres',
        JWT_EXPIRES_IN: '1h',
        CORS_ORIGINS: WEB_URL,
        LOGIN_RATE_LIMIT: '1000',
        LOGIN_RATE_TTL: '60',
        SWAGGER_ENABLED: 'false',
        APP_TIMEZONE: 'America/Sao_Paulo',
      },
    },
    {
      // Front compilado; o `vite preview` repassa /api para a API do e2e (OPSBOARD_API_URL).
      command: `npm run build && npx vite preview --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: { OPSBOARD_API_URL: API_URL },
    },
  ],
});
