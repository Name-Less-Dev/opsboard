import { type MiddlewareConsumer, Module, type NestModule, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ClockModule } from './clock/clock.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { validationError } from './common/errors/domain.exception';
import { toValidationDetails } from './common/errors/validation-details';
import { requestLogMiddleware } from './common/request-log/request-log';
import { requestIdMiddleware } from './common/request-id/request-id';
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
    // Pipe e filtro registrados como provider (e não em main.ts) para valerem também nos testes.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: (errors) => validationError(toValidationDetails(errors)),
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Nesta ordem: o log usa o requestId.
    consumer.apply(requestIdMiddleware, requestLogMiddleware).forRoutes('*');
  }
}
