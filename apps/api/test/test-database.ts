import path from 'node:path';
import { config } from 'dotenv';

config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const DEFAULT_URL = 'postgresql://opsboard:opsboard@localhost:5432/opsboard_test';

// Único ponto que decide qual banco os testes usam. Eles apagam tabelas inteiras, então
// qualquer nome que não termine em _test é recusado: isso protege o banco de desenvolvimento.
export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_URL;
  const name = new URL(url).pathname.slice(1);
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`TEST_DATABASE_URL precisa apontar para um banco *_test (veio "${name}")`);
  }
  return url;
}
