import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';
import { configureApp } from './configure-app';
import { buildOpenApiDocument } from './openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get(AppConfig);

  // Em produção, só com SWAGGER_ENABLED=true: o documento expõe todas as rotas e formatos.
  if (config.swaggerEnabled) {
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app));
  }

  await app.listen(config.port);
}
// `void`: se o boot falhar, a rejeição não tratada derruba o processo (padrão do Node), que é o desejado.
void bootstrap();
