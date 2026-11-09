import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// O .env fica na raiz do monorepo. Se ele não existir (ex.: dentro do Docker),
// o dotenv não faz nada e as variáveis vêm do ambiente.
config({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Sem env() do Prisma (que lança erro): o `prisma generate` do build Docker
    // não tem banco nem .env. Migrate e seed sem a variável falham com erro claro.
    // DIRECT_DATABASE_URL (opcional): conexão direta, sem pooler, para o CLI (migrations).
    // Com o Neon, a aplicação usa a URL do pooler (DATABASE_URL) e as migrations a direta.
    // No Prisma 7 o `directUrl` saiu do schema; a URL do CLI fica só aqui.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
  },
});
