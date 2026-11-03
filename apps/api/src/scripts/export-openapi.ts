import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { buildOpenApiDocument } from '../openapi';

// O documento não depende do banco nem do segredo, e o Prisma só conecta na primeira query:
// valores fictícios deixam o export rodar sem .env (ex.: no CI). Valores reais têm precedência.
process.env.DATABASE_URL ??= 'postgresql://export:export@localhost:5432/export';
process.env.JWT_SECRET ??= 'somente-para-gerar-o-documento-openapi';
process.env.JWT_EXPIRES_IN ??= '1h';

// Roda a partir de dist/ (compilado): o Swagger precisa dos metadados de tipo dos decorators,
// que o tsc emite e o tsx não.
async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  const output = resolve(__dirname, '../../openapi.json');
  writeFileSync(output, `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`);
  await app.close();
  console.log(`OpenAPI exportado em ${output}`);
}

void exportOpenApi();
