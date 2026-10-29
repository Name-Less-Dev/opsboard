import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
// `void`: se o boot falhar, a rejeição não tratada derruba o processo (padrão do Node), que é o desejado.
void bootstrap();
