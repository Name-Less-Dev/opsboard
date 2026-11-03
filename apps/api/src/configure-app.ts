import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { REQUEST_ID_HEADER } from './common/request-id/request-id';

// "https://a.com, https://b.com" → lista; vazio ou ausente → nenhuma origem liberada.
export function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

// Ajustes do Express que dependem da aplicação criada (não cabem num módulo).
// Usado pelo main.ts e pelos testes, para os dois rodarem com a mesma configuração.
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const express = app as NestExpressApplication;

  // Quantos proxies à frente da API são confiáveis para ler o IP real do X-Forwarded-For.
  // 0 (padrão) ignora o header: o IP é o da conexão. Um número maior que o real deixa o cliente
  // forjar o próprio IP e escapar do limite de tentativas de login.
  express.set('trust proxy', Number(config.get<string>('TRUST_PROXY') ?? 0));

  // Headers de segurança padrão (CSP, nosniff, frame-ancestors etc.).
  app.use(helmet());

  // Sem origens configuradas, nenhum header CORS é enviado e o navegador bloqueia chamadas de
  // outra origem. O front oficial não precisa de CORS: chega pela mesma origem (nginx / Vite).
  const origins = parseCorsOrigins(config.get<string>('CORS_ORIGINS'));
  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    // O token vai no header Authorization, não em cookie: sem credentials.
    credentials: false,
    exposedHeaders: [REQUEST_ID_HEADER],
  });
}
