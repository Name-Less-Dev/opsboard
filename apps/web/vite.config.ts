import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Fuso fixo para a conversão de datas locais ter resultado conhecido em qualquer máquina.
    env: { TZ: 'America/Sao_Paulo' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
      // Global modesto (aprovado no Dia 5): só pega quedas grandes.
      thresholds: { statements: 80, branches: 70, functions: 80, lines: 80 },
    },
  },
  server: {
    // Mesmo contrato do nginx no Docker: /api/health -> http://localhost:3000/health.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
