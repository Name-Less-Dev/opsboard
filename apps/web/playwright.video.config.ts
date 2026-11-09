import { defineConfig } from '@playwright/test';

// Gravação do vídeo de demonstração (`npm run video:demo`). Separada dos testes: outra pasta,
// sem webServer (grava contra uma pilha já no ar, local ou produção) e sem banco próprio.
export default defineConfig({
  testDir: './e2e-video',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { headless: true },
  projects: [{ name: 'video' }],
});
