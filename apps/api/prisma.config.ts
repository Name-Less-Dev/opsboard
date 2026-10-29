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
    url: process.env.DATABASE_URL,
  },
});
