import { execSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';
import { DEFAULT_E2E_DATABASE_URL, e2eDatabaseName } from '../src/scripts/e2e-database';

// Prepara o banco dos testes e2e: (1) confere o nome (_e2e), (2) cria o banco se faltar,
// (3) recria o schema com as migrations e (4) roda o seed do e2e.
// Lê E2E_DATABASE_URL (não DATABASE_URL), para nunca herdar a URL de desenvolvimento do .env.

async function main() {
  const url = process.env.E2E_DATABASE_URL ?? DEFAULT_E2E_DATABASE_URL;
  const name = e2eDatabaseName(url);

  // O `migrate reset` do Prisma 7 não cria o banco que não existe; CREATE DATABASE precisa de
  // uma conexão em outro banco. O nome já foi validado, por isso pode ir entre aspas.
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' };
  const cwd = path.resolve(__dirname, '..');
  // O Prisma 7 não roda seed no reset (não existe mais --skip-seed): o seed do e2e vem depois.
  execSync('npx prisma migrate reset --force', { cwd, env, stdio: 'inherit' });
  execSync('npx tsx prisma/seed-e2e.ts', { cwd, env, stdio: 'inherit' });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
