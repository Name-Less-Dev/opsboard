import { execSync } from 'node:child_process';
import path from 'node:path';
import { Client } from 'pg';
import { getTestDatabaseUrl } from './test-database';

// Roda uma vez antes da suíte: garante que o banco de teste existe e está com as migrations.
export default async function globalSetup(): Promise<void> {
  const url = getTestDatabaseUrl();
  const name = new URL(url).pathname.slice(1);

  // CREATE DATABASE precisa de uma conexão em outro banco.
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount === 0) {
      // O nome já foi validado por getTestDatabaseUrl; CREATE DATABASE não aceita parâmetro.
      await admin.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.end();
  }

  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
