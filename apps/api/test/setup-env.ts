import { getTestDatabaseUrl } from './test-database';

// Valores fixos para a suíte não depender de um .env (ex.: no CI).
process.env.JWT_SECRET = 'segredo-de-teste-com-pelo-menos-32-caracteres';
process.env.JWT_EXPIRES_IN = '1h';
// Sobrescreve o DATABASE_URL de desenvolvimento antes de o AppModule ler a configuração.
process.env.DATABASE_URL = getTestDatabaseUrl();
// As suítes fazem muitos logins do mesmo IP; o teste do 429 sobe uma aplicação com o limite real.
process.env.LOGIN_RATE_LIMIT = '1000';
