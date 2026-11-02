import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // No host, lê o .env da raiz do monorepo (o cwd é apps/api).
    // No Docker o arquivo não existe e as variáveis vêm do docker-compose.yml.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    PrismaModule,
    HealthModule,
    AuthModule,
  ],
  providers: [
    // Registrado como provider (e não em main.ts) para valer também nos testes de integração.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    },
  ],
})
export class AppModule {}
