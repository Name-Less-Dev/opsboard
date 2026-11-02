import { getTestDatabaseUrl } from './test-database';

// Valores fixos para a suíte não depender de um .env (ex.: no CI).
process.env.JWT_SECRET = 'segredo-de-teste';
process.env.JWT_EXPIRES_IN = '1h';
// Sobrescreve o DATABASE_URL de desenvolvimento antes de o AppModule ler a configuração.
process.env.DATABASE_URL = getTestDatabaseUrl();
