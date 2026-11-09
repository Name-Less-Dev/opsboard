import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { REQUEST_ID_HEADER } from './common/request-id/request-id';
import { AppConfig } from './config/app-config';

// Ajustes do Express que dependem da aplicação criada (não cabem num módulo).
// Usado pelo main.ts e pelos testes, para os dois rodarem com a mesma configuração.
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);
  const express = app as NestExpressApplication;

  // Quantos proxies à frente da API são confiáveis para ler o IP real do X-Forwarded-For.
  // 0 (padrão) ignora o header: o IP é o da conexão. Um número maior que o real deixa o cliente
  // forjar o próprio IP e escapar do limite de tentativas de login.
  express.set('trust proxy', config.trustProxy);

  // Headers de segurança padrão (CSP, nosniff, frame-ancestors etc.).
  app.use(helmet());

  // Sem origens configuradas, nenhum header CORS é enviado e o navegador bloqueia chamadas de
  // outra origem. O front oficial não precisa de CORS: chega pela mesma origem (nginx / Vite).
  app.enableCors({
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    // O token vai no header Authorization, não em cookie: sem credentials.
    credentials: false,
    // Content-Disposition: com o front em outro domínio, o navegador só deixa ler o nome do
    // arquivo exportado (opsboard-ordens-AAAAMMDD-HHmm.csv) se a API expuser o header.
    exposedHeaders: [REQUEST_ID_HEADER, 'Content-Disposition'],
  });
}
