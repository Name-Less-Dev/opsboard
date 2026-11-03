import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ClockModule } from './clock/clock.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';

@Module({
  imports: [
    // No host, lê o .env da raiz do monorepo (o cwd é apps/api).
    // No Docker o arquivo não existe e as variáveis vêm do docker-compose.yml.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    PrismaModule,
    ClockModule,
    HealthModule,
    AuthModule,
    WorkOrdersModule,
    DashboardModule,
  ],
  providers: [
    // Registrado como provider (e não em main.ts) para valer também nos testes de integração.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
