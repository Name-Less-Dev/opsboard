import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get(AppConfig);

  // Em produção, só com SWAGGER_ENABLED=true: o documento expõe todas as rotas e formatos.
  if (config.swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('OpsBoard API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  await app.listen(config.port);
}
// `void`: se o boot falhar, a rejeição não tratada derruba o processo (padrão do Node), que é o desejado.
void bootstrap();
