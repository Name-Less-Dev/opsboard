import { execSync } from 'node:child_process';
import { E2E_DATABASE_URL, E2E_PASSWORD, REPO_ROOT } from './support/env.ts';

// Roda uma vez antes de todos os testes: recria o banco e2e (schema + seed). O script recusa
// bancos cujo nome não termine em `_e2e`. A API já está no ar, mas só abre conexão com o banco
// na primeira consulta (o readiness do webServer usa uma rota que não toca no banco).
export default function globalSetup(): void {
  execSync('npm run e2e:db', {
    cwd: REPO_ROOT,
    env: { ...process.env, E2E_DATABASE_URL, E2E_PASSWORD },
    stdio: 'inherit',
  });
}
