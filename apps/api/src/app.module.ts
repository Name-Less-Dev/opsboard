import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // No host, lê o .env da raiz do monorepo (o cwd é apps/api).
    // No Docker o arquivo não existe e as variáveis vêm do docker-compose.yml.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
