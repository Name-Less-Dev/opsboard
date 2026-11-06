import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Configuração única do e2e: portas, banco e usuários. Tudo é valor de teste descartável.

export const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4100);
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/** Banco dedicado; o script `e2e:db` recusa qualquer nome que não termine em `_e2e`. */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://opsboard:opsboard@localhost:5432/opsboard_e2e';

/** Senha dos usuários do seed e2e. Só existe neste ambiente de teste. */
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-senha-de-teste-123';

/** Os mesmos usuários de `apps/api/prisma/seed-e2e.ts` (se mudar lá, mude aqui). */
export const USERS = {
  supervisor: { name: 'Sílvia Supervisora', email: 'supervisora@e2e.opsboard.test' },
  operator: { name: 'Otávio Operador', email: 'otavio@e2e.opsboard.test' },
  otherOperator: { name: 'Olga Operadora', email: 'olga@e2e.opsboard.test' },
} as const;

const here = path.dirname(fileURLToPath(import.meta.url));
export const WEB_ROOT = path.resolve(here, '../..');
export const REPO_ROOT = path.resolve(WEB_ROOT, '../..');
export const AUTH_DIR = path.join(WEB_ROOT, 'e2e/.auth');
export const STORAGE = {
  operator: path.join(AUTH_DIR, 'operator.json'),
  supervisor: path.join(AUTH_DIR, 'supervisor.json'),
} as const;
